const PALETTE = [
  "#7BAE8A",  // Sage
  "#5B8DB5",  // Denim
  "#C47A5A",  // Clay
  "#9B7BAE",  // Mauve
  "#3D9B8A",  // Jade
  "#C4A84A",  // Saffron
  "#5A7A9B",  // Slate
  "#6B9B5A",  // Fern
  "#7B6BAE",  // Dusk
  "#B5804A",  // Copper
  "#4A8B9B",  // Mist
  "#8B9B4A",  // Herb
];

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getColorFromId(id: string): string {
  return PALETTE[hashCode(id) % PALETTE.length];
}

export function getColorBg(color: string): string {
  return color + "26";
}
