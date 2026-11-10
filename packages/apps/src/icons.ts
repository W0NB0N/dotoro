import type { AppIcon } from '@dotoro/kernel';

// 16x16 menu art, one character per pixel (the letters are listed in chrome.ts). Palette roles
// rather than colors, so every theme repaints them. Two frames each, for a little idle motion.

const snakeTop = [
  '............g...',
  '..gggggggg.aaa..',
  '.ggggggggg.aaa..',
  '.gg.........a...',
  '.gg.............',
  '.ggggggggggggg..',
  '..gggggggggggg..',
  '............gg..',
  '............gg..',
  '..ffff......gg..',
  '.ffffffggggggg..',
  '.fbfffggggggg...',
];

const snakeBottom = ['..ffff..........', '................', '................'];

export const SNAKE_ICON: AppIcon = {
  frames: [
    [...snakeTop, '.ffffff.........', ...snakeBottom],
    // The tongue flicks.
    [...snakeTop, 'dffffff.........', ...snakeBottom],
  ],
};

const tomatoTop = [
  '.......gg.......',
  '......gg........',
  '....gggggg......',
  '..aaaggggaaaa...',
  '.aaaaagaaaaaaa..',
  'aaffaaaaaaaaaaa.',
  'afaaaaabaaaaaaa.',
  'aaaaaaabaaaaaaa.',
  'aaaaaaabaaaaaaa.',
];

const tomatoBottom = [
  'aaaaaaaaaaaaaaa.',
  'aaaaaaaaaaaaaaa.',
  '.aaaaaaaaaaaaa..',
  '..aaaaaaaaaaa...',
  '....aaaaaaa.....',
  '................',
];

export const POMODORO_ICON: AppIcon = {
  // A kitchen timer: the hands tick.
  frames: [
    [...tomatoTop, 'aaaaaaabbbbaaaa.', ...tomatoBottom],
    [...tomatoTop, 'aaaabbbbaaaaaaa.', ...tomatoBottom],
  ],
};

export const THEMES_ICON: AppIcon = {
  frames: [
    [
      '................',
      '.....ffffffff...',
      '...ffffffffffff.',
      '..ffffaafffffff.',
      '.fffffaaffwwfff.',
      '.ffffffffffwwff.',
      'ffgg.ffffffffff.',
      'fgggfffffffffff.',
      'fggffff..fffff..',
      'ffffff....ffff..',
      '.fffff....fff...',
      '.fffffff.ffff...',
      '..fffddffffff...',
      '...ffddfffff....',
      '.....ffffff.....',
      '................',
    ],
    [
      '................',
      '.....ffffffff...',
      '...ffffffffffff.',
      '..ffffggfffffff.',
      '.fffffggffaafff.',
      '.ffffffffffaaff.',
      'ffdd.ffffffffff.',
      'fdddfffffffffff.',
      'fddffff..fffff..',
      'ffffff....ffff..',
      '.fffff....fff...',
      '.fffffff.ffff...',
      '..fffwwffffff...',
      '...ffwwfffff....',
      '.....ffffff.....',
      '................',
    ],
  ],
};

const pictureBottom = [
  'fssssssaassssf..',
  'fsssssaaaasssf..',
  'fsaasaaaaaassf..',
  'faaaaaaaaaaasf..',
  'faaaaaaaaaaaaf..',
  'ffffffffffffff..',
  'f............f..',
  'ffffffffffffff..',
  '................',
];

export const GALLERY_ICON: AppIcon = {
  frames: [
    [
      'ffffffffffffff..',
      'fssssssssssssf..',
      'fsssssssswwssf..',
      'fssssssswwwwsf..',
      'fssssssswwwwsf..',
      'fsssssssswwssf..',
      'fssssssssssssf..',
      ...pictureBottom,
    ],
    // The sun glints.
    [
      'ffffffffffffff..',
      'fssssssssfsssf..',
      'fsssssssswwssf..',
      'fsssssfswwwwff..',
      'fssssssswwwwsf..',
      'fsssssssswwssf..',
      'fssssssssfsssf..',
      ...pictureBottom,
    ],
  ],
};

/** For apps that don't bring their own: a blank cartridge. */
export const BLANK_ICON: AppIcon = {
  frames: [
    [
      '................',
      '..ssssssssssss..',
      '..ssssssssssss..',
      '..ss........ss..',
      '..ss.ffffff.ss..',
      '..ss........ss..',
      '..ss.ffffff.ss..',
      '..ss........ss..',
      '..ssssssssssss..',
      '..ssssssssssss..',
      '..ss.s.s.s.sss..',
      '..ss.s.s.s.sss..',
      '...ssssssssss...',
      '................',
      '................',
      '................',
    ],
  ],
};
