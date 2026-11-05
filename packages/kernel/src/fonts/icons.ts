// Ported from dotoro-proto backend/core/graphics.py by tools/parity/extract_fonts.py.
// This file is now the source of truth; edit it directly.
import { defineBitmaps } from '../bitmap';

export const ICONS = defineBitmaps({
  "HEART": ["01010", "11111", "11111", "01110", "00100"],
  "PLAY": ["1000", "1100", "1110", "1100", "1000"],
  "PAUSE": ["11011", "11011", "11011", "11011", "11011"],
  "CHECK": ["00001", "00010", "10100", "01000", "00000"],
  "ARROW_UP": ["00100", "01110", "10101", "00100", "00100"],
});
