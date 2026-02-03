import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/constants";
import { Box, Layers, Palette, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface QualityPricing {
  draft: number;
  normal: number;
  high: number;
}

interface MaterialPricing {
  pla: number;
  petg: number;
  abs: number;
}

interface PricingConfig {
  quality_pricing: QualityPricing;
  material_surcharge: MaterialPricing;
  minimum_order: number;
  custom_color_surcharge: number;
  rush_order_multiplier: number;
}

interface DeliveryConfig {
  colombo_charge: number;
  island_min: number;
  island_max: number;
}

interface PricingImages {
  draft_image: string;
  normal_image: string;
  high_image: string;
}

const defaultPricingConfig: PricingConfig = {
  quality_pricing: { draft: 15, normal: 20, high: 30 },
  material_surcharge: { pla: 0, petg: 5, abs: 8 },
  minimum_order: 500,
  custom_color_surcharge: 200,
  rush_order_multiplier: 1.5,
};

const defaultDeliveryConfig: DeliveryConfig = {
  colombo_charge: 300,
  island_min: 400,
  island_max: 600,
};

const defaultPricingImages: PricingImages = {
  draft_image: "",
  normal_image: "",
  high_image: "",
};

export default function Pricing() {
  const [pricingConfig, setPricingConfig] = useState<PricingConfig>(defaultPricingConfig);
  const [deliveryConfig, setDeliveryConfig] = useState<DeliveryConfig>(defaultDeliveryConfig);
  const [pricingImages, setPricingImages] = useState<PricingImages>(defaultPricingImages);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchPricingConfig();
  }, []);

  const fetchPricingConfig = async () => {
    try {
      const [pricingResult, deliveryResult, imagesResult] = await Promise.all([
        supabase.from("system_settings").select("value").eq("key", "pricing_config").maybeSingle(),
        supabase.from("system_settings").select("value").eq("key", "delivery_config").maybeSingle(),
        supabase.from("system_settings").select("value").eq("key", "pricing_images").maybeSingle(),
      ]);

      if (pricingResult.data?.value && typeof pricingResult.data.value === 'object') {
        setPricingConfig(pricingResult.data.value as unknown as PricingConfig);
      }

      if (deliveryResult.data?.value && typeof deliveryResult.data.value === 'object') {
        setDeliveryConfig(deliveryResult.data.value as unknown as DeliveryConfig);
      }

      if (imagesResult.data?.value && typeof imagesResult.data.value === 'object') {
        setPricingImages(imagesResult.data.value as unknown as PricingImages);
      }
    } catch (error) {
      console.error("Error fetching pricing config:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const pricingTiers = [
    {
      quality: "Draft",
      layerHeight: "0.3mm",
      description: "Fast prints for prototyping",
      pricePerGram: pricingConfig.quality_pricing.draft,
      icon: Zap,
      color: "from-amber-500 to-orange-600",
      customImage: pricingImages.draft_image,
    },
    {
      quality: "Normal",
      layerHeight: "0.2mm",
      description: "Balanced quality and speed",
      pricePerGram: pricingConfig.quality_pricing.normal,
      icon: Layers,
      popular: true,
      color: "from-primary to-teal-600",
      customImage: pricingImages.normal_image,
    },
    {
      quality: "High",
      layerHeight: "0.1mm",
      description: "Maximum detail and smoothness",
      pricePerGram: pricingConfig.quality_pricing.high,
      icon: Box,
      color: "from-blue-500 to-indigo-600",
      customImage: pricingImages.high_image,
    },
  ];

  const materialPricing = [
    { 
      name: "PLA", 
      basePrice: pricingConfig.material_surcharge.pla, 
      description: pricingConfig.material_surcharge.pla === 0 ? "Standard material" : `+Rs.${pricingConfig.material_surcharge.pla}/gram` 
    },
    { 
      name: "PETG", 
      basePrice: pricingConfig.material_surcharge.petg, 
      description: `+Rs.${pricingConfig.material_surcharge.petg}/gram` 
    },
    { 
      name: "ABS", 
      basePrice: pricingConfig.material_surcharge.abs, 
      description: `+Rs.${pricingConfig.material_surcharge.abs}/gram` 
    },
  ];

  const rushPercentage = Math.round((pricingConfig.rush_order_multiplier - 1) * 100);

  const additionalFees = [
    { name: "Minimum Order", value: formatPrice(pricingConfig.minimum_order) },
    { name: "Color Change", value: "Free (basic colors)" },
    { name: "Custom Color", value: `${formatPrice(pricingConfig.custom_color_surcharge)} surcharge` },
    { name: "Rush Order (24h)", value: `+${rushPercentage}% of print cost` },
    { name: "Delivery (Colombo)", value: formatPrice(deliveryConfig.colombo_charge) },
    { name: "Delivery (Island-wide)", value: `${formatPrice(deliveryConfig.island_min)} - ${formatPrice(deliveryConfig.island_max)}` },
  ];

  if (isLoading) {
    return (
      <Layout>
        <div className="py-24 bg-secondary/30">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <Skeleton className="h-12 w-64 mx-auto mb-4" />
              <Skeleton className="h-6 w-96 mx-auto" />
            </div>
            <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <Skeleton className="h-32 w-full" />
                  <CardHeader>
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-4 w-48" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-10 w-24" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="py-24 bg-secondary/30">
        <div className="container mx-auto px-4">
          {/* Header */}
          <div className="text-center mb-16">
            <h1 className="font-display text-4xl md:text-5xl font-bold mb-4">
              Transparent <span className="text-primary">Pricing</span>
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Simple pricing based on material weight and quality. No hidden fees.
            </p>
          </div>

          {/* Quality Tiers */}
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-16">
            {pricingTiers.map((tier, index) => (
              <Card 
                key={index} 
                className={`relative overflow-hidden ${tier.popular ? "ring-2 ring-primary shadow-glow" : ""}`}
              >
                {tier.popular && (
                  <div className="absolute top-4 right-4">
                    <Badge className="bg-primary text-primary-foreground">Most Popular</Badge>
                  </div>
                )}
                {tier.customImage ? (
                  <div className="h-32 flex items-center justify-center overflow-hidden">
                    <img 
                      src={tier.customImage} 
                      alt={`${tier.quality} quality`} 
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className={`h-32 bg-gradient-to-br ${tier.color} flex items-center justify-center`}>
                    <tier.icon className="w-16 h-16 text-white/90" />
                  </div>
                )}
                <CardHeader>
                  <CardTitle className="font-display text-2xl">{tier.quality} Quality</CardTitle>
                  <p className="text-muted-foreground">{tier.description}</p>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <span className="text-4xl font-display font-bold">{formatPrice(tier.pricePerGram)}</span>
                    <span className="text-muted-foreground">/gram</span>
                  </div>
                  <p className="text-sm text-muted-foreground">Layer Height: {tier.layerHeight}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Material Pricing */}
          <div className="max-w-3xl mx-auto mb-16">
            <h2 className="font-display text-2xl font-bold text-center mb-8">
              <Palette className="inline-block w-6 h-6 mr-2 text-primary" />
              Material Options
            </h2>
            <div className="grid md:grid-cols-3 gap-4">
              {materialPricing.map((material, index) => (
                <Card key={index} className="text-center">
                  <CardContent className="pt-6">
                    <h3 className="font-display font-semibold text-xl mb-1">{material.name}</h3>
                    <p className="text-muted-foreground text-sm">{material.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Additional Fees */}
          <div className="max-w-2xl mx-auto">
            <h2 className="font-display text-2xl font-bold text-center mb-8">Additional Information</h2>
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-3">
                  {additionalFees.map((fee, index) => (
                    <div key={index} className="flex justify-between items-center py-2 border-b border-border last:border-0">
                      <span className="text-muted-foreground">{fee.name}</span>
                      <span className="font-semibold">{fee.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <p className="text-center text-muted-foreground text-sm mt-6">
              * Final price is calculated by our team based on model complexity and actual material usage.
              <br />
              You'll receive an exact quote before payment.
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}