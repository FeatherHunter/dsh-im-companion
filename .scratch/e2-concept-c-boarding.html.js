
var homes=[
 {name:'小帅2',b:['客服小冰|飞书|on','群管家|微信|on']},
 {name:'阿梨',b:['夜间值班|QQ|warn']},
 {name:'老墨',b:['商务一号|飞书|on','朋友圈号|微信|off','老客户群|QQ|on']},
];
var drag=null;
function render(){
  var g=document.getElementById('grid');g.innerHTML='';
  homes.forEach(function(h,hi){
    var t=document.createElement('div');t.className='ticket';
    var bots=h.b.map(function(s){var p=s.split('|');return{n:p[0],ch:p[1],st:p[2]};});
    t.innerHTML='<div class="stub"><span class="no">No.0'+(hi+1)+'</span><span class="dest">'+h.name+'</span><span class="n">'+bots.length+' PAX</span></div><div class="perf"></div><div class="pax"></div>';
    var pax=t.querySelector('.pax');
    bots.forEach(function(b){
      var r=document.createElement('div');r.className='row';r.setAttribute('draggable','true');
      r.innerHTML='<span class="dot '+(b.st==='on'?'on':b.st==='warn'?'warn':'')+'"></span><span>'+b.n+'</span><span class="ch">'+b.ch+'</span>';
      r.addEventListener('dragstart',function(ev){drag={raw:b.n+'|'+b.ch+'|'+b.st,from:hi};r.classList.add('drag');ev.dataTransfer.effectAllowed='move';try{ev.dataTransfer.setData('text/plain',b.n);}catch(e){}});
      r.addEventListener('dragend',function(){r.classList.remove('drag');clear();});
      pax.appendChild(r);
    });
    t.addEventListener('dragover',function(ev){if(!drag)return;ev.preventDefault();clear();t.classList.add('over');});
    t.addEventListener('drop',function(ev){
      if(!drag)return;ev.preventDefault();clear();var d=drag;drag=null;
      if(d.from===hi){say('它已经在'+homes[hi].name+'家了');return;}
      var src=homes[d.from].b,ix=src.indexOf(d.raw);if(ix>=0)src.splice(ix,1);
      homes[hi].b.push(d.raw);render();
      say('“'+d.raw.split('|')[0]+'”登机 → '+homes[hi].name+'家');
    });
    g.appendChild(t);
  });
}
function clear(){document.querySelectorAll('.ticket.over').forEach(function(n){n.classList.remove('over');});}
function say(t){document.getElementById('msg').textContent=t;}
render();
