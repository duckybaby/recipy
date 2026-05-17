// Equipment-icon registry — maps a normalized equipment name (lowercase,
// trimmed) to a HugeIcons icon component. The lookup is fuzzy via substring
// match, so "12-inch frying pan" still resolves to the frying-pan icon.
//
// Why HugeIcons: the free Stroke-Rounded set is purpose-built for kitchen
// items — `Pot01`, `Pan01/02/03`, `Whisk`, `Mortar`, `RollingPin`, `Spatula`,
// `GasStove`, `Microwave`, `Oven`, `BalanceScale`, `Blender`, `Mixer`. Stroke
// weight is consistent across the lot, which keeps the Equipment grid feeling
// like one family rather than a Frankenstein of mixed sets.

import {
  BalanceScaleIcon,
  BlenderIcon,
  ChefHatIcon,
  CookBookIcon,
  Dish01Icon,
  GasStoveIcon,
  KitchenUtensilsIcon,
  Knife01Icon,
  MicrowaveIcon,
  MixerIcon,
  MortarIcon,
  OvenIcon,
  Pan01Icon,
  Pan02Icon,
  Pan03Icon,
  Pot01Icon,
  Pot02Icon,
  RiceBowl01Icon,
  RollingPinIcon,
  SpatulaIcon,
  SpoonIcon,
  ThermometerIcon,
  Timer01Icon,
  WhiskIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgObject } from "@hugeicons/react";

interface Entry {
  match: string[]; // substrings checked against the normalized name
  icon: IconSvgObject;
}

// Order matters — first match wins, so put more-specific entries above
// shorter overlaps (e.g. "pressure cooker" before "cooker").
const ENTRIES: Entry[] = [
  { match: ["pressure cooker", "instant pot"], icon: Pot02Icon },
  { match: ["rice cooker"], icon: RiceBowl01Icon },
  {
    match: ["dutch oven", "stock pot", "heavy-bottomed pot", "deep pot"],
    icon: Pot01Icon,
  },
  { match: ["saucepan", "small pot"], icon: Pot02Icon },
  { match: ["tadka pan", "tempering pan"], icon: Pan03Icon },
  { match: ["frying pan", "skillet", "non-stick pan"], icon: Pan01Icon },
  { match: ["wok", "kadhai", "kadai"], icon: Pan02Icon },
  { match: ["tava", "tawa", "griddle"], icon: Pan01Icon },
  { match: ["mixing bowl", "bowl"], icon: Dish01Icon },
  { match: ["chef knife", "knife"], icon: Knife01Icon },
  { match: ["ladle"], icon: SpoonIcon },
  { match: ["spatula"], icon: SpatulaIcon },
  { match: ["wooden spoon", "spoon"], icon: SpoonIcon },
  { match: ["whisk"], icon: WhiskIcon },
  { match: ["mortar", "pestle"], icon: MortarIcon },
  { match: ["rolling pin"], icon: RollingPinIcon },
  { match: ["blender"], icon: BlenderIcon },
  { match: ["mixer grinder", "mixie", "food processor"], icon: MixerIcon },
  { match: ["measuring spoon"], icon: SpoonIcon },
  { match: ["thermometer"], icon: ThermometerIcon },
  { match: ["timer"], icon: Timer01Icon },
  { match: ["scale", "weighing"], icon: BalanceScaleIcon },
  { match: ["microwave"], icon: MicrowaveIcon },
  { match: ["oven"], icon: OvenIcon },
  { match: ["stove", "burner", "gas"], icon: GasStoveIcon },
  { match: ["recipe book", "cookbook"], icon: CookBookIcon },
  { match: ["utensil"], icon: KitchenUtensilsIcon },
];

/** Find the best HugeIcons icon for an equipment label. */
export function iconFor(name: string): IconSvgObject {
  const n = name.trim().toLowerCase();
  for (const entry of ENTRIES) {
    if (entry.match.some((m) => n.includes(m))) return entry.icon;
  }
  // Generic fallback — chef hat. Showing up regularly means we should either
  // add a mapping above or drop the item from recipes.
  return ChefHatIcon;
}
