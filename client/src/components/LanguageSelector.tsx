import { Globe } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { LANGUAGES, toLanguage } from "@shared/i18n";

/** English / اردو / العربية. Each option is shown in its own language. */
export function LanguageSelector({ className }: { className?: string }) {
  const { lang, setLang, t } = useLanguage();
  return (
    <Select value={lang} onValueChange={value => setLang(toLanguage(value))}>
      <SelectTrigger
        size="sm"
        aria-label={t("common.language")}
        className={`w-auto gap-2 text-sm ${className ?? ""}`}
      >
        <Globe className="h-4 w-4" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LANGUAGES.map(l => (
          <SelectItem key={l.code} value={l.code}>
            {l.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
