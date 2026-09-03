
/* ===== 绾ā鍧楋細鎷栨嫿棰嗗吇鐘舵€佹満锛堟棤 DOM锛屽彲鏁翠綋鎼繘鐪熶唬鐮侊紱椤甸潰鍙槸澹筹級===== */
'use strict';
var WS = [
  { id: 'ws-a', name: '宸ヤ綔鍖?A 路 灏忓竻' },
  { id: 'ws-b', name: '宸ヤ綔鍖?B 路 闃挎ⅷ' },
  { id: 'ws-c', name: '宸ヤ綔鍖?C 路 鑰佸ⅷ' },
];
var BOTS = [
  { id: 'bot-feishu-1', channel: '椋炰功' },
  { id: 'bot-wechat-1', channel: '寰俊' },
  { id: 'bot-qq-1', channel: 'QQ' },
  { id: 'bot-feishu-2', channel: '椋炰功' },
];
var SEED = { 'bot-qq-1': 'ws-a', 'bot-feishu-2': 'ws-b' }; // 鍐茬獊璧版煡鐢ㄧ殑宸茬粦瀹氳捣鐐?var UNDO_STEPS = 3; // toast 鎾ら攢绐楀彛锛? 娆♀€滄椂闂存祦閫濃€濆悗杩囨湡锛堟紨绀虹敤锛?褋胁11鐪熷疄鐜板啀瀹?5s锛?
function botName(id) { return id; }
function wsName(id) {
  for (var i = 0; i < WS.length; i++) if (WS[i].id === id) return WS[i].name;
  return id;
}
function initialState() {
  var bind = {};
  for (var k in SEED) bind[k] = SEED[k];
  return { bind: bind, drag: null, confirm: null, toast: null, lastChange: '鍒濆锛? 涓湭缁戝畾锛? 涓凡缁戝畾銆?, log: ['init锛氳捣鐐瑰凡灏辩华'] };
}
function say(s, msg) { s.lastChange = msg; s.log = s.log.concat([msg]).slice(-30); return s; }

/* reducer锛?state, action) => state锛屽叏绾嚱鏁?*/
function reduce(s, a) {
  var n = JSON.parse(JSON.stringify(s));
  switch (a.type) {
    case 'reset': return initialState();
    case 'start': {
      if (n.drag) return say(n, '宸插湪鎷栨嫿涓紝鍏堟斁涓嬫垨鍙栨秷锛堜竴娆″彧鎷栦竴涓級銆?);
      if (n.confirm) return say(n, '纭寮圭獥寮€鐫€锛屽厛澶勭悊瀹冦€?);
      n.drag = { botId: a.bot, over: null };
      n.toast = null;
      return say(n, '鎷胯捣 ' + a.bot + '锛? + channelOf(a.bot) + '锛夛紝鎷栧埌宸︽爮宸ヤ綔鍖鸿涓娿€?);
    }
    case 'over': {
      if (!n.drag) return say(n, '鎵嬮噷娌℃嬁涓滆タ锛屾偓鍋滄棤鏁堛€?);
      n.drag.over = a.target;
      if (a.target === 'empty') return say(n, '鎮仠鍦ㄧ┖鐧藉 鈫?涓嶅彲鏀撅紙E2 涓嶅仛鈥滄嫋鍑烘柊寤衡€濓紝璧扮幇鏈夋柊寤烘祦绋嬶級銆?);
      if (a.target === null) return say(n, '鎮仠绂诲紑鐩爣銆?);
      var cur = n.bind[n.drag.botId] || null;
      if (!cur) return say(n, '鎮仠鍦? + wsName(a.target) + ' 鈫?鍙斁锛堟湭缁戝畾锛岀洿缁戯級銆?);
      if (cur === a.target) return say(n, '鎮仠鍦? + wsName(a.target) + ' 鈫?瀹冨凡缁忓湪杩欓噷锛屾斁涓?鏃犳搷浣溿€?);
      return say(n, '鎮仠鍦? + wsName(a.target) + ' 鈫?鍙斁浣嗘湁鍐茬獊锛堢幇灞? + wsName(cur) + '锛屾斁涓嬩細寮圭‘璁わ級銆?);
    }
    case 'drop': {
      if (!n.drag) return say(n, '鎵嬮噷娌℃嬁涓滆タ锛屾斁涓嬫棤鏁堛€?);
      var d = n.drag; n.drag = null;
      if (d.over === null || d.over === 'empty')
        return say(n, '鏀惧湪' + (d.over === 'empty' ? '绌虹櫧澶? : '鐩爣涔嬪') + ' 鈫?鎷掔粷锛岀粦瀹氬叧绯讳笉鍙樸€?);
      var now = n.bind[d.botId] || null;
      if (!now) {
        n.bind[d.botId] = d.over;
        n.toast = { botId: d.botId, from: null, to: d.over, left: UNDO_STEPS };
        return say(n, '缁戝畾鎴愬姛锛? + d.botId + ' 鈫?' + wsName(d.over) + '锛坱oast 鎾ら攢绐楀彛宸插紑锛夈€?);
      }
      if (now === d.over) return say(n, '瀹冩湰鏉ュ氨鍦? + wsName(d.over) + '锛屾棤鎿嶄綔銆?);
      n.confirm = { botId: d.botId, from: now, to: d.over };
      return say(n, '鍐茬獊锛? + d.botId + ' 鐜板睘' + wsName(now) + ' 鈫?寮逛簩娆＄‘璁わ紝纭鍚庢崲缁戝埌' + wsName(d.over) + '銆?);
    }
    case 'cancel-drag': {
      if (!n.drag) return say(n, '娌″湪鎷栵紝鏃犱簨鍙彇娑堛€?);
      var b = n.drag.botId; n.drag = null;
      return say(n, '鍙栨秷鎷栨嫿锛圗sc / 鎷栧洖鍘熷锛夛紝' + b + ' 鍥炲埌鍘熶綅銆?);
    }
    case 'confirm-yes': {
      if (!n.confirm) return say(n, '娌℃湁寰呯‘璁ょ殑鎹㈢粦銆?);
      var c = n.confirm; n.confirm = null;
      n.bind[c.botId] = c.to;
      n.toast = { botId: c.botId, from: c.from, to: c.to, left: UNDO_STEPS };
      return say(n, '宸叉崲缁戯細' + c.botId + ' 浠? + wsName(c.from) + ' 鈫?' + wsName(c.to) + '锛堜粛鍙?toast 鎾ら攢锛夈€?);
    }
    case 'confirm-no': {
      if (!n.confirm) return say(n, '娌℃湁寰呯‘璁ょ殑鎹㈢粦銆?);
      var c2 = n.confirm; n.confirm = null;
      return say(n, '宸插彇娑堟崲缁戯細' + c2.botId + ' 鐣欏湪' + wsName(c2.from) + '銆?);
    }
    case 'undo': {
      if (!n.toast) return say(n, '娌℃湁鍙挙閿€鐨勭粦瀹氾紙绐楀彛宸插叧鎴栧凡杩囨湡锛夈€?);
      var t = n.toast; n.toast = null;
      if (t.from === null) delete n.bind[t.botId];
      else n.bind[t.botId] = t.from;
      return say(n, '宸叉挙閿€锛? + t.botId + ' 鍥炲埌' + (t.from === null ? '鏈粦瀹氭睜' : wsName(t.from)) + '銆?);
    }
    case 'tick': {
      if (!n.toast) return say(n, '娌℃湁寮€鐫€鐨勬挙閿€绐楀彛锛屾椂闂存祦閫濇棤浜嬪彂鐢熴€?);
      n.toast.left -= 1;
      if (n.toast.left <= 0) { n.toast = null; return say(n, '鎾ら攢绐楀彛杩囨湡锛氱粦瀹氬凡钀藉畾锛屾鏃跺啀鐐光€滄挙閿€鈥濅細琚嫆缁濄€?); }
      return say(n, '鏃堕棿娴侀€濃€︽挙閿€绐楀彛杩樺墿 ' + n.toast.left + ' 姝ャ€?);
    }
  }
  return n;
}
function channelOf(id) {
  for (var i = 0; i < BOTS.length; i++) if (BOTS[i].id === id) return BOTS[i].channel;
  return '?';
}

