import { supabase } from "@/integrations/supabase/client";

export interface Member {
  id: string;
  name: string;
}

export async function fetchMembers(): Promise<Member[]> {
  const { data, error } = await supabase.from("members").select("id, name").order("name");
  if (error) throw error;
  return data as Member[];
}
