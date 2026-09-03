
var homes=[
 {name:'小帅2',b:['客服小冰|飞书|on','群管家|微信|on']},
 {name:'阿梨',b:['夜间值班|QQ|warn']},
 {name:'老墨',b:['商务一号|飞书|on','朋友圈号|微信|off','老客户群|QQ|on']},
];
var drag=null;
function render(){
  var g=document.getElementById('grid');g.innerHTML='';
  homes.forEach(function(h,hi){
    var card=document.createElement('div');card.className='isle i'+(hi%3);
    var bots=h.b.map(function(s){var p=s.split('|');return{n:p[0],ch:p[1],st:p[2]};});
    card.innerHTML='<div class="top"><span class="avatar">'+h.name.charAt(0)+'</span><span class="name">'+h.name+'</span><span class="n">'+bots.length+' 个机器人</span></div>';
    bots.forEach(function(b){
      var r=document.createElement('div');r.className='row';r.setAttribute('draggable','true');
      r.innerHTML='<span class="dot '+(b.st==='on'?'on':b.st==='warn'?'warn':'')+'"></span><span>'+b.n+'</span><span class="ch">'+b.ch+'</span>';
      r.addEventListener('dragstart',function(ev){drag={raw:b.n+'|'+b.ch+'|'+b.st,from:hi};r.classList.add('drag');ev.dataTransfer.effectAllowed='move';try{ev.dataTransfer.setData('text/plain',b.n);}catch(e){}});
      r.addEventListener('dragend',function(){r.classList.remove('drag');clear();});
      card.appendChild(r);
    });
    card.addEventListener('dragover',function(ev){if(!drag)return;ev.preventDefault();clear();card.classList.add('over');});
    card.addEventListener('drop',function(ev){
      if(!drag)return;ev.preventDefault();clear();var d=drag;drag=null;
      if(d.from===hi){say('它已经在'+homes[hi].name+'家了');return;}
      var src=homes[d.from].b,ix=src.indexOf(d.raw);if(ix>=0)src.splice(ix,1);
      homes[hi].b.push(d.raw);render();
      say('“'+d.raw.split('|')[0]+'”搬到了'+homes[hi].name+'家');
    });
    g.appendChild(card);
  });
}
function clear(){document.querySelectorAll('.isle.over').forEach(function(n){n.classList.remove('over');});}
function say(t){document.getElementById('msg').textContent=t;}
render();
