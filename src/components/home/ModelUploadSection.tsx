import { useState, useCallback, useRef, Suspense, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stage, Center } from "@react-three/drei";
import { Upload, FileUp, X, Box, RotateCcw, ZoomIn, Minus, Plus, ChevronRight, Tag, Check, Percent, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { MATERIALS, QUALITY_PRESETS } from "@/lib/constants";
import { setOrderData } from "@/lib/orderStore";
import { supabase } from "@/integrations/supabase/client";
import * as THREE from "three";

interface UploadedModel {
  file: File;
  geometry: THREE.BufferGeometry | null;
  name: string;
  config: ModelConfig;
}

interface ModelConfig {
  material: string;
  quality: string;
  color: string;
  infill: number;
  quantity: number;
  notes: string;
}

interface AvailableColor {
  id: string;
  name: string;
  hex_value: string;
}

interface UserCoupon {
  id: string;
  coupon_id: string;
  is_used: boolean;
  coupon: {
    code: string;
    discount_type: string;
    discount_value: number;
    valid_until: string | null;
  };
}

const defaultConfig: ModelConfig = {
  material: "pla",
  quality: "normal",
  color: "#FFFFFF",
  infill: 20,
  quantity: 1,
  notes: "",
};

function ModelMesh({ geometry, color }: { geometry: THREE.BufferGeometry; color: string }) {
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={color} metalness={0.3} roughness={0.4} />
    </mesh>
  );
}

function ModelViewer({ geometry, color }: { geometry: THREE.BufferGeometry; color: string }) {
  return (
    <Canvas shadows camera={{ position: [0, 0, 5], fov: 50 }} className="rounded-xl">
      <Suspense fallback={null}>
        <Stage environment="city" intensity={0.5} adjustCamera={false}>
          <Center>
            <ModelMesh geometry={geometry} color={color} />
          </Center>
        </Stage>
        <OrbitControls 
          enableZoom={true} 
          enablePan={false} 
          autoRotate 
          autoRotateSpeed={2}
          minDistance={2}
          maxDistance={10}
        />
      </Suspense>
    </Canvas>
  );
}

export function ModelUploadSection() {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedModels, setUploadedModels] = useState<UploadedModel[]>([]);
  const [activeModel, setActiveModel] = useState<number>(0);
  const [expandedModels, setExpandedModels] = useState<Set<number>>(new Set([0]));
  const [isLoading, setIsLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadingFileName, setLoadingFileName] = useState<string>("");
  const [availableColors, setAvailableColors] = useState<AvailableColor[]>([]);
  const [userCoupons, setUserCoupons] = useState<UserCoupon[]>([]);
  const [selectedCouponId, setSelectedCouponId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  // Fetch available colors from database
  useEffect(() => {
    const fetchColors = async () => {
      const { data } = await supabase
        .from("available_colors")
        .select("id, name, hex_value")
        .eq("is_active", true)
        .order("sort_order");
      
      if (data && data.length > 0) {
        setAvailableColors(data);
      }
    };
    fetchColors();
  }, []);

  // Fetch user's available coupons
  useEffect(() => {
    const fetchUserCoupons = async () => {
      if (!user) {
        setUserCoupons([]);
        return;
      }

      const { data } = await supabase
        .from("user_coupons")
        .select(`
          id,
          coupon_id,
          is_used,
          coupon:coupons(code, discount_type, discount_value, valid_until)
        `)
        .eq("user_id", user.id)
        .eq("is_used", false);
      
      if (data) {
        const validCoupons = data
          .filter((uc: any) => {
            if (!uc.coupon) return false;
            if (!uc.coupon.valid_until) return true;
            return new Date(uc.coupon.valid_until) > new Date();
          })
          .map((uc: any) => ({
            id: uc.id,
            coupon_id: uc.coupon_id,
            is_used: uc.is_used,
            coupon: uc.coupon
          }));
        setUserCoupons(validCoupons);
      }
    };
    fetchUserCoupons();
  }, [user]);

  const selectedCoupon = userCoupons.find(uc => uc.id === selectedCouponId);

  const toggleModelExpanded = (index: number) => {
    setExpandedModels(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const parseSTL = useCallback((arrayBuffer: ArrayBuffer): THREE.BufferGeometry => {
    const geometry = new THREE.BufferGeometry();
    const data = new DataView(arrayBuffer);
    
    const isBinary = arrayBuffer.byteLength > 84;
    
    if (isBinary) {
      const triangles = data.getUint32(80, true);
      const vertices: number[] = [];
      const normals: number[] = [];
      
      let offset = 84;
      for (let i = 0; i < triangles; i++) {
        const nx = data.getFloat32(offset, true);
        const ny = data.getFloat32(offset + 4, true);
        const nz = data.getFloat32(offset + 8, true);
        offset += 12;
        
        for (let j = 0; j < 3; j++) {
          const x = data.getFloat32(offset, true);
          const y = data.getFloat32(offset + 4, true);
          const z = data.getFloat32(offset + 8, true);
          vertices.push(x, y, z);
          normals.push(nx, ny, nz);
          offset += 12;
        }
        offset += 2;
      }
      
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    }
    
    geometry.computeBoundingSphere();
    geometry.center();
    
    const boundingSphere = geometry.boundingSphere;
    if (boundingSphere) {
      const scale = 2 / boundingSphere.radius;
      geometry.scale(scale, scale, scale);
    }
    
    return geometry;
  }, []);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.stl') && 
        !file.name.toLowerCase().endsWith('.obj') &&
        !file.name.toLowerCase().endsWith('.3mf')) {
      return;
    }

    setIsLoading(true);
    setLoadProgress(0);
    setLoadingFileName(file.name);

    try {
      // Read file with progress tracking (0% -> 90%)
      const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onprogress = (e) => {
          if (e.lengthComputable) {
            setLoadProgress(Math.round((e.loaded / e.total) * 90));
          }
        };
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
      });

      // Parsing phase (90% -> 100%)
      setLoadProgress(95);
      // Yield to the browser so the progress UI can paint before the heavy parse
      await new Promise((r) => setTimeout(r, 30));
      const geometry = parseSTL(arrayBuffer);
      setLoadProgress(100);

      const defaultColor = availableColors.length > 0 ? availableColors[0].hex_value : "#FFFFFF";

      const newIndex = uploadedModels.length;
      setUploadedModels(prev => [...prev, {
        file,
        geometry,
        name: file.name,
        config: { ...defaultConfig, color: defaultColor }
      }]);
      setActiveModel(newIndex);

      // Collapse all except the new one
      setExpandedModels(new Set([newIndex]));
    } catch (error) {
      console.error("Error parsing model:", error);
    } finally {
      // Brief delay so users see the 100% state
      setTimeout(() => {
        setIsLoading(false);
        setLoadProgress(0);
        setLoadingFileName("");
      }, 250);
    }
  }, [parseSTL, uploadedModels.length, availableColors]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    files.forEach(handleFile);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(handleFile);
  }, [handleFile]);

  const removeModel = (index: number) => {
    setUploadedModels(prev => prev.filter((_, i) => i !== index));
    setExpandedModels(prev => {
      const newSet = new Set<number>();
      prev.forEach(i => {
        if (i < index) newSet.add(i);
        else if (i > index) newSet.add(i - 1);
      });
      return newSet;
    });
    if (activeModel >= index && activeModel > 0) {
      setActiveModel(activeModel - 1);
    }
  };

  const updateModelConfig = (index: number, key: keyof ModelConfig, value: string | number) => {
    setUploadedModels(prev => prev.map((model, i) => 
      i === index 
        ? { ...model, config: { ...model.config, [key]: value } }
        : model
    ));
  };

  const handleSubmitOrder = () => {
    const couponData = selectedCoupon ? {
      user_coupon_id: selectedCoupon.id,
      code: selectedCoupon.coupon.code,
      discount_type: selectedCoupon.coupon.discount_type,
      discount_value: selectedCoupon.coupon.discount_value
    } : null;

    // Store models in memory (File objects can't be serialized in navigation state)
    const modelsForOrder = uploadedModels.map(m => ({
      file: m.file,
      name: m.name,
      config: m.config
    }));
    
    setOrderData({ models: modelsForOrder, coupon: couponData });

    if (user) {
      navigate("/checkout");
    } else {
      navigate("/register", { state: { redirectToCheckout: true } });
    }
  };

  const currentModel = uploadedModels[activeModel];
  const colorsToUse = availableColors.length > 0 ? availableColors : [
    { id: "1", name: "White", hex_value: "#FFFFFF" },
    { id: "2", name: "Black", hex_value: "#1a1a1a" },
  ];

  return (
    <section className="bg-gradient-to-br from-background via-background to-primary/5 py-8" id="upload">
      <div className="container mx-auto px-4">
        {/* User's Available Coupons - Top */}
        {user && userCoupons.length > 0 && (
          <Card className="mb-6">
            <CardContent className="py-3 px-4">
              <div className="flex flex-wrap items-center gap-3">
                <Tag className="w-5 h-5 text-primary" />
                <span className="font-medium text-sm">Your Coupons:</span>
                <div className="flex flex-wrap gap-2">
                  {userCoupons.map((uc) => (
                    <button
                      key={uc.id}
                      onClick={() => setSelectedCouponId(selectedCouponId === uc.id ? null : uc.id)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${
                        selectedCouponId === uc.id
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-secondary border-border hover:border-primary/50"
                      }`}
                    >
                      {selectedCouponId === uc.id && <Check className="w-4 h-4" />}
                      <Percent className="w-3 h-3" />
                      <span className="font-medium text-sm">{uc.coupon.code}</span>
                      <span className="text-xs opacity-80">
                        {uc.coupon.discount_type === 'percentage' 
                          ? `${uc.coupon.discount_value}% off` 
                          : `LKR ${uc.coupon.discount_value} off`}
                      </span>
                    </button>
                  ))}
                </div>
                {selectedCoupon && (
                  <span className="text-sm text-success font-medium ml-auto">
                    Coupon applied!
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid lg:grid-cols-5 gap-8 items-stretch max-w-7xl mx-auto">
          {/* Left Side - Drag & Drop + 3D Viewer (takes 3 columns) */}
          <div className="lg:col-span-3 flex flex-col">
            <div className="text-center lg:text-left mb-4">
              <h1 className="font-display text-3xl md:text-4xl font-bold mb-2">
                Upload Your <span className="text-gradient">3D Model</span>
              </h1>
              <p className="text-muted-foreground">
                Drag and drop your STL file to preview and configure your order
              </p>
            </div>

            <Card className="overflow-hidden border-2 border-dashed border-border hover:border-primary/50 transition-colors">
              <CardContent className="p-0">
                {uploadedModels.length === 0 ? (
                  <div
                    className={`relative min-h-[320px] flex flex-col items-center justify-center p-8 transition-all duration-300 ${
                      isDragging ? "bg-primary/10 border-primary" : "bg-secondary/30"
                    }`}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileInput}
                      accept=".stl,.obj,.3mf"
                      multiple
                      className="hidden"
                    />
                    
                    <div className={`w-20 h-20 rounded-2xl bg-primary-gradient flex items-center justify-center mb-4 transition-transform ${isDragging ? "scale-110" : ""}`}>
                      {isLoading ? (
                        <div className="w-8 h-8 border-4 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                      ) : (
                        <Upload className="w-10 h-10 text-primary-foreground" />
                      )}
                    </div>
                    
                    <h3 className="font-display text-xl font-semibold mb-2">
                      {isDragging ? "Drop your model here" : "Drag & Drop Your 3D Model"}
                    </h3>
                    <p className="text-muted-foreground text-sm mb-4">
                      Supports STL, OBJ, and 3MF files up to 100MB
                    </p>
                    
                    <Button 
                      onClick={() => fileInputRef.current?.click()}
                      className="bg-primary-gradient shadow-glow"
                    >
                      <FileUp className="w-4 h-4 mr-2" />
                      Browse Files
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col">
                    {/* 3D Viewer */}
                    <div className="relative h-[260px] sm:h-[320px] lg:h-[360px] bg-gradient-to-br from-slate-900 to-slate-800">
                      {currentModel?.geometry && (
                        <ModelViewer geometry={currentModel.geometry} color={currentModel.config.color} />
                      )}
                      
                      <div className="absolute bottom-3 left-3 flex gap-2">
                        <div className="glass-dark px-2 py-1 rounded text-white/70 text-xs flex items-center gap-1">
                          <RotateCcw className="w-3 h-3" /> Drag to rotate
                        </div>
                        <div className="glass-dark px-2 py-1 rounded text-white/70 text-xs flex items-center gap-1">
                          <ZoomIn className="w-3 h-3" /> Scroll to zoom
                        </div>
                      </div>
                    </div>

                    {/* Model List */}
                    <div className="p-3 border-t border-border bg-card">
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {uploadedModels.map((model, index) => (
                          <div
                            key={index}
                            className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                              activeModel === index 
                                ? "bg-primary/10 border border-primary/30" 
                                : "bg-secondary hover:bg-secondary/80"
                            }`}
                            onClick={() => setActiveModel(index)}
                          >
                            <div 
                              className="w-4 h-4 rounded-full border border-border" 
                              style={{ backgroundColor: model.config.color }}
                            />
                            <span className="text-sm font-medium truncate max-w-[100px]">{model.name}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeModel(index);
                              }}
                              className="p-0.5 hover:bg-destructive/20 rounded text-muted-foreground hover:text-destructive"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="flex-shrink-0 px-3 py-2 border-2 border-dashed border-border rounded-lg text-muted-foreground hover:border-primary hover:text-primary transition-colors flex items-center gap-2"
                        >
                          <Upload className="w-4 h-4" />
                          <span className="text-sm">Add</span>
                        </button>
                      </div>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileInput}
                        accept=".stl,.obj,.3mf"
                        multiple
                        className="hidden"
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Side - Order Configuration (takes 2 columns) */}
          <div className="lg:col-span-2 flex flex-col">
            <div className="h-[76px]"></div> {/* Spacer to align with left side title */}
            <Card className="flex-1 flex flex-col">
              <CardHeader className="pb-2 border-b">
                <CardTitle className="font-display text-xl">Order Configuration</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-center space-y-3 pt-4">
                {uploadedModels.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Box className="w-12 h-12 mx-auto mb-4 opacity-30" />
                    <p>Upload 3D models to configure your order</p>
                  </div>
                ) : (
                  uploadedModels.map((model, index) => {
                    const isExpanded = expandedModels.has(index);
                    const material = MATERIALS[model.config.material as keyof typeof MATERIALS];
                    const quality = QUALITY_PRESETS[model.config.quality as keyof typeof QUALITY_PRESETS];
                    
                    return (
                      <Collapsible key={index} open={isExpanded} onOpenChange={() => toggleModelExpanded(index)}>
                        <Card className={`border ${activeModel === index ? 'border-primary/50' : ''}`}>
                          <CollapsibleTrigger asChild>
                            <div 
                              className={`p-3 cursor-pointer hover:bg-muted/50 transition-colors ${isExpanded ? 'border-b' : ''}`}
                              onClick={() => setActiveModel(index)}
                            >
                              <div className="flex items-center gap-3">
                                <div 
                                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                                  style={{ backgroundColor: model.config.color }}
                                >
                                  <Box className="w-4 h-4 text-white mix-blend-difference" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm truncate">{model.name}</p>
                                  {!isExpanded && (
                                    <p className="text-xs text-muted-foreground">
                                      {material?.name} • {quality?.name} • {model.config.infill}% • ×{model.config.quantity}
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeModel(index);
                                    }}
                                    className="p-1.5 hover:bg-destructive/20 rounded text-muted-foreground hover:text-destructive"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                  {isExpanded ? (
                                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                  ) : (
                                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                  )}
                                </div>
                              </div>
                            </div>
                          </CollapsibleTrigger>
                          
                          <CollapsibleContent>
                            <CardContent className="p-4 pt-3 space-y-4">
                              {/* Color Selection */}
                              <div className="space-y-2">
                                <Label className="text-xs">Color</Label>
                                <div className="flex flex-wrap gap-1.5">
                                  {colorsToUse.map((color) => (
                                    <button
                                      key={color.id}
                                      onClick={() => updateModelConfig(index, "color", color.hex_value)}
                                      className={`w-7 h-7 rounded-full border-2 transition-all ${
                                        model.config.color === color.hex_value
                                          ? "border-primary scale-110 shadow-md"
                                          : "border-border hover:border-primary/50"
                                      }`}
                                      style={{ backgroundColor: color.hex_value }}
                                      title={color.name}
                                    />
                                  ))}
                                </div>
                              </div>

                              {/* Material & Quality Row */}
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <Label className="text-xs">Material</Label>
                                  <Select
                                    value={model.config.material}
                                    onValueChange={(v) => updateModelConfig(index, "material", v)}
                                  >
                                    <SelectTrigger className="h-9 text-xs bg-background">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-popover z-50">
                                      {Object.entries(MATERIALS).map(([key, mat]) => (
                                        <SelectItem key={key} value={key} className="text-xs">
                                          {mat.name} {mat.surcharge > 0 && `(+${mat.surcharge}%)`}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">Quality</Label>
                                  <Select
                                    value={model.config.quality}
                                    onValueChange={(v) => updateModelConfig(index, "quality", v)}
                                  >
                                    <SelectTrigger className="h-9 text-xs bg-background">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-popover z-50">
                                      {Object.entries(QUALITY_PRESETS).map(([key, preset]) => (
                                        <SelectItem key={key} value={key} className="text-xs">
                                          {preset.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>

                              {/* Infill */}
                              <div className="space-y-1">
                                <div className="flex justify-between">
                                  <Label className="text-xs">Infill</Label>
                                  <span className="text-xs text-muted-foreground">{model.config.infill}%</span>
                                </div>
                                <Slider
                                  value={[model.config.infill]}
                                  onValueChange={([v]) => updateModelConfig(index, "infill", v)}
                                  min={10}
                                  max={100}
                                  step={5}
                                  className="py-1"
                                />
                              </div>

                              {/* Quantity */}
                              <div className="flex items-center justify-between">
                                <Label className="text-xs">Quantity</Label>
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => updateModelConfig(index, "quantity", Math.max(1, model.config.quantity - 1))}
                                  >
                                    <Minus className="w-3 h-3" />
                                  </Button>
                                  <span className="w-8 text-center font-semibold">
                                    {model.config.quantity}
                                  </span>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => updateModelConfig(index, "quantity", model.config.quantity + 1)}
                                  >
                                    <Plus className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>

                              {/* Notes */}
                              <div className="space-y-1">
                                <Label className="text-xs">Notes (Optional)</Label>
                                <Textarea
                                  placeholder="Special instructions..."
                                  value={model.config.notes}
                                  onChange={(e) => updateModelConfig(index, "notes", e.target.value)}
                                  rows={2}
                                  className="text-xs bg-background resize-none"
                                />
                              </div>
                            </CardContent>
                          </CollapsibleContent>
                        </Card>
                      </Collapsible>
                    );
                  })
                )}
              </CardContent>
            </Card>

            {/* Submit Button */}
            <Button
              size="lg"
              disabled={uploadedModels.length === 0}
              onClick={handleSubmitOrder}
              className="w-full bg-primary-gradient shadow-glow text-lg h-14"
            >
              {user ? "Proceed to Checkout" : "Register to Order"}
              <ChevronRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
