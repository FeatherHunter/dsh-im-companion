
var homes=[
 {name:'小帅2',color:'#0a84ff',bots:[{n:'客服小冰',ch:'飞书',st:'on'},{n:'群管家',ch:'微信',st:'on'}]},
 {name:'阿梨',color:'#30d158',bots:[{n:'夜间值班',ch:'QQ',st:'warn'}]},
 {name:'老墨',color:'#bf5af2',bots:[{n:'商务一号',ch:'飞书',st:'on'},{n:'朋友圈号',ch:'微信',st:'off'},{n:'老客户群',ch:'QQ',st:'on'}]},
];
var drag=null;
function render(){
  var g=document.getElementById('grid');g.innerHTML='';
  homes.forEach(function(h,hi){
    var card=document.createElement('div');card.className='home';
    card.innerHTML='<div class="mark">'+h.name.charAt(0)+'</div><div class="who">HOME · 0'+(hi+1)+'</div><p class="name">'+h.name+'</p><p class="count">'+h.bots.length+' 个机器人</p>';
    h.bots.forEach(function(b){
      var r=document.createElement('div');r.className='row';r.setAttribute('draggable','true');
      r.innerHTML='<span class="dot '+(b.st==='on'?'on':b.st==='warn'?'warn':'')+'"></span><span>'+b.n+'</span><span class="ch">'+b.ch+'</span>';
      r.addEventListener('dragstart',function(ev){drag={b:b,from:hi};r.classList.add('drag');ev.dataTransfer.effectAllowed='move';try{ev.dataTransfer.setData('text/plain',b.n);}catch(e){}});
      r.addEventListener('dragend',function(){r.classList.remove('drag');clear();});
      card.appendChild(r);
    });
    card.addEventListener('dragover',function(ev){if(!drag)return;ev.preventDefault();clear();card.classList.add('over');});
    card.addEventListener('drop',function(ev){
      if(!drag)return;ev.preventDefault();clear();var d=drag;drag=null;
      if(d.from===hi){say('它已经在'+homes[hi].name+'家了');return;}
      homes[d.from].bots.splice(homes[d.from].bots.indexOf(d.b),1);
      homes[hi].bots.push(d.b);render();
      say('“'+d.b.n+'”搬到了'+homes[hi].name+'家');
    });
    g.appendChild(card);
  });
}
function clear(){document.querySelectorAll('.home.over').forEach(function(n){n.classList.remove('over');});}
function say(t){document.getElementById('msg').textContent=t;}
render();
