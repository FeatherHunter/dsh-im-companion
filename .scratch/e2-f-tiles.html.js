
var FC=['#0a84ff','#30a853','#a06ee1'];
var homes=[
 {name:'小帅2',b:[['客服小冰','飞书','on'],['群管家','微信','on']]},
 {name:'阿梨',b:[['夜间值班','QQ','warn']]},
 {name:'老墨',b:[['商务一号','飞书','on'],['朋友圈号','微信','off'],['老客户群','QQ','on']]},
];
var drag=null;
function render(){
  var g=document.getElementById('grid');g.innerHTML='';
  homes.forEach(function(h,hi){
    var card=document.createElement('div');card.className='home';
    card.innerHTML='<div class="hd"><span class="face" style="background:'+FC[hi%3]+'">'+h.name.charAt(0)+'</span><span class="nm">'+h.name+'</span><span class="ct">'+h.b.length+' 个机器人</span></div>';
    h.b.forEach(function(x){
      var r=document.createElement('div');r.className='row';
      r.innerHTML='<span class="dot '+(x[2]==='on'?'on':'')+'"></span><span>'+x[0]+'</span><span class="ch">'+x[1]+'</span>';
      r.setAttribute('draggable','true');
      r.addEventListener('dragstart',function(ev){drag={x:x,from:hi};r.classList.add('drag');ev.dataTransfer.effectAllowed='move';try{ev.dataTransfer.setData('text/plain',x[0]);}catch(e){}});
      var ph=document.createElement('div');ph.className='row ph';ph.textContent=x[0];
      r.parentNode.insertBefore(ph,r.nextSibling);
      var cleanPh=function(){ try{ph.remove();}catch(e){} };
      r.addEventListener('dragend',function(){r.classList.remove('drag');cleanPh();clear();});
      card.appendChild(r);
    });
    card.addEventListener('dragover',function(ev){if(!drag)return;ev.preventDefault();clear();card.classList.add('over');});
    card.addEventListener('drop',function(ev){
      if(!drag)return;ev.preventDefault();clear();var d=drag;drag=null;
      if(d.from===hi){say('它已经在'+homes[hi].name+'家了');return;}
      homes[d.from].b.splice(homes[d.from].b.indexOf(d.x),1);homes[hi].b.push(d.x);render();
      say('“'+d.x[0]+'”搬到了'+homes[hi].name+'家');
    });
    g.appendChild(card);
  });
}
function clear(){document.querySelectorAll('.home.over').forEach(function(n){n.classList.remove('over');});}
function say(t){document.getElementById('msg').textContent=t;}
render();
