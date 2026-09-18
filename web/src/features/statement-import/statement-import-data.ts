import {
  FileCheckIcon,
  ScanTextIcon,
  ShieldCheckIcon,
  type LucideIcon,
} from "lucide-react";

type ImportFeature = {
  label: string;
  description: string;
  icon: LucideIcon;
};

const importFileRules = {
  accept: ".pdf",
  formats: ["PDF"],
  maxSizeMb: 25,
};

const importFeatures: ImportFeature[] = [
  {
    label: "Supported formats",
    description: "PDF",
    icon: FileCheckIcon,
  },
  {
    label: "Supported providers",
    description: "BDO AMEX, EastWest Visa, and GCash E-Wallet",
    icon: ScanTextIcon,
  },
  {
    label: "PDF processing",
    description: "Browser only",
    icon: ShieldCheckIcon,
  },
];

export { importFeatures, importFileRules };
