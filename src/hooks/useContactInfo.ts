import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ContactConfig {
  admin_phone: string;
  address: string;
  whatsapp_number: string;
}

const defaultContactConfig: ContactConfig = {
  admin_phone: "0717367497",
  address: "1001 S. Main St., STE 500, Kalispell, MT 59901, United States",
  whatsapp_number: "",
};

export function useContactInfo() {
  const [contactInfo, setContactInfo] = useState<ContactConfig>(defaultContactConfig);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchContactInfo = async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "contact_config")
        .maybeSingle();

      if (!error && data?.value && typeof data.value === "object" && !Array.isArray(data.value)) {
        setContactInfo({ ...defaultContactConfig, ...(data.value as unknown as ContactConfig) });
      }
      setIsLoading(false);
    };

    fetchContactInfo();

    // Subscribe to changes
    const channel = supabase
      .channel("contact-config")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "system_settings",
          filter: "key=eq.contact_config",
        },
        () => fetchContactInfo()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { contactInfo, isLoading };
}
