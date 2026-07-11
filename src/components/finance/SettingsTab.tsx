import { ExportData } from "./ExportData";
import { ImportData } from "./ImportData";
import { WhatsAppSettings } from "./WhatsAppSettings";
import { Shield } from "lucide-react";

interface Props {
  userId: string;
}

export function SettingsTab({ userId }: Props) {
  return (
    <div className="space-y-6 max-w-3xl">
      {/* WhatsApp integration (Fase 0 — cadastro de números) */}
      <WhatsAppSettings userId={userId} />

      {/* Export */}
      <ExportData userId={userId} />

      {/* Import */}
      <ImportData userId={userId} />

      {/* Backup note */}
      <div className="flex gap-2 p-4 rounded-xl border bg-muted/20 text-xs text-muted-foreground">
        <Shield className="h-4 w-4 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          Este projeto usa o <strong className="text-foreground">Lovable Cloud</strong> como backend
          (banco gerenciado) — não é possível migrar para um Supabase próprio/externo. Use o{" "}
          <strong className="text-foreground">Backup completo (JSON)</strong> acima periodicamente como
          proteção: ele pode ser reimportado a qualquer momento pela seção "Importar backup".
        </p>
      </div>
    </div>
  );
}
