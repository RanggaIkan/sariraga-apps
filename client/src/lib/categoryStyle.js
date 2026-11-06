// client/src/lib/categoryStyle.js: UI styling per waste category (pastel card, darker text tone, icon).
import { Cylinder, Milk, Package } from 'lucide-react';

export const CAT_STYLE = {
  botol: { bg: '#DCF2E6', tone: '#0E7A52', icon: Milk },
  kaleng: { bg: '#FAEDCD', tone: '#93600A', icon: Cylinder },
  kardus: { bg: '#EFE4D8', tone: '#7A5233', icon: Package },
};
