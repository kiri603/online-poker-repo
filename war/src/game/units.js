export const UNIT_ORDER = ['mao', 'jiahao', 'mengqi', 'kun', 'nailong', 'naiwa'];
export const UNIT_TYPES = {
  mao: { name: '耄耋', role: '突袭 · 近战', trait: '哈气扑击，快速切入侧翼。', hp: 90, attack: 24, cost: 60, armor: 0, speed: 4.4, range: 1.35, cooldown: .72, radius: .38, skill: 'hiss', shield: 0 },
  jiahao: { name: '嘉豪', role: '控场 · 音波', trait: '穿透音浪，打断进攻节奏。', hp: 120, attack: 18, cost: 110, armor: 2, speed: 3.0, range: 6.5, cooldown: 1.35, radius: .36, skill: 'wave', shield: 0 },
  mengqi: { name: '胖猫', role: '承伤 · 护盾', trait: '梦境护盾，守住阵线。', hp: 380, attack: 20, cost: 160, armor: 7, speed: 2.35, range: 1.6, cooldown: 1.15, radius: .49, skill: 'shield', shield: 110 },
  kun: { name: '坤坤', role: '远程 · 投射', trait: '保持距离，篮球远程压制。', hp: 105, attack: 36, cost: 120, armor: 1, speed: 2.8, range: 9.5, cooldown: 1.55, radius: .35, skill: 'basketball', shield: 0 },
  nailong: { name: '奶龙', role: '重装 · 破阵', trait: '蓄力踏地，震散密集敌军。', hp: 440, attack: 58, cost: 260, armor: 5, speed: 1.9, range: 1.9, cooldown: 2.0, radius: .48, skill: 'stomp', shield: 0 },
  naiwa: { name: '奶娃', role: '支援 · 鼓舞', trait: '笑声鼓舞，加速友军攻势。', hp: 150, attack: 12, cost: 180, armor: 2, speed: 2.7, range: 5.0, cooldown: 1.3, radius: .43, skill: 'inspire', shield: 0 }
};

// Keep the speed differences between roles while allowing time to react and reposition.
for (const [kind, type] of Object.entries(UNIT_TYPES)) {
  type.speed *= .6;
  type.vision = kind === 'mao' ? 18 : kind === 'kun' ? 15 : kind === 'nailong' ? 11 : 13;
}
