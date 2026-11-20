const $ = id => document.getElementById(id);
const fmt = (ts, date=false) => new Date(ts*1000).toLocaleString("zh-CN",{
    ...(date ? {month:"2-digit",day:"2-digit"} : {}),hour:"2-digit",minute:"2-digit",hour12:false
});
let data, selected="entry", tab="samples", sequence=0;
const text = (id,value) => { $(id).textContent=value; };
function node(tag,value) {
    const element=document.createElement(tag);
    element.textContent=value;
    return element;
}
function draw() {
    const c=$("chart"), ctx=c.getContext("2d"), w=c.clientWidth,h=c.clientHeight;
    c.width=w*devicePixelRatio; c.height=h*devicePixelRatio;
    ctx.scale(devicePixelRatio,devicePixelRatio);
    if(!data) return;
    const points=data.items.find(i=>i.key===selected).trend;
    const max=Math.max(10,...points.map(p=>p.ms))*1.12,left=35;
    ctx.font="11px monospace";ctx.fillStyle="#afbec4";
    for(const ratio of [0,0.5,1]){
        const y=8+(h-20)*(1-ratio);
        ctx.fillText(String(Math.round(max*ratio)),1,y+3);
        ctx.strokeStyle="#34444a";ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(w,y);ctx.stroke();
    }
    let prev;
    for(const p of points){
        const t=Math.max(data.since,Math.min(data.now,p.at+data.bucket/2));
        const x=left+(w-left-4)*(t-data.since)/(data.now-data.since),y=8+(h-20)*(1-p.ms/max);
        ctx.strokeStyle="#8ee3bf";ctx.fillStyle="#8ee3bf";ctx.lineWidth=2;
        if(prev && p.at-prev.at===data.bucket){
            ctx.beginPath();ctx.moveTo(prev.x,prev.y);ctx.lineTo(x,y);ctx.stroke();
        }
        ctx.beginPath();ctx.arc(x,y,2.5,0,Math.PI*2);ctx.fill();prev={at:p.at,x,y};
    }
}
function records(item) {
    const list=$("records");
    const isSamples=tab==="samples";
    const rows=isSamples ? item.recent.map(r=>[fmt(r.at,true),r.ok?"成功":"失败",r.ms+" ms",r.note])
        : data.events.filter(e=>e.key===selected).map(e=>[fmt(e.at,true),e.state==="正常"?"恢复":"故障",e.sent?"SMTP 已接收":"待发送",e.attempts+" 次"]);
    list.replaceChildren();
    if(!rows.length){
        const info=node("p",isSamples?"所选时段暂无采样":"所选时段内，这项探测没有故障或恢复事件。");
        info.className="empty";list.append(info);return;
    }
    const table=document.createElement("table"),header=table.createTHead().insertRow();
    for(const col of isSamples?["时间","结果","耗时","响应"]:["时间","事件","投递状态","失败重试"])header.append(node("th",col));
    const body=table.createTBody();
    for(const row of rows){const tr=body.insertRow();for(const value of row)tr.append(node("td",value));}
    list.append(table);
}
function show() {
    const item=data.items.find(i=>i.key===selected);
    const total=data.items.reduce((sum,i)=>sum+i.stats.total,0);
    text("health",data.items.filter(i=>i.state==="正常").length+" / "+data.items.length);
    text("rate",total?(100*data.items.reduce((sum,i)=>sum+i.stats.passed,0)/total).toFixed(2)+"%":"—");
    text("total",total.toLocaleString());text("pending",data.pending);
    for(const i of data.items){
        let button=$("probe-"+i.key);
        if(!button){
            button=document.createElement("button");button.className="probe";button.id="probe-"+i.key;
            button.append(node("i",""),node("b",i.name),node("small",""));
            button.onclick=()=>{selected=i.key;show();};$("probes").append(button);
        }
        button.setAttribute("aria-pressed",i.key===selected);
        button.firstChild.className=i.state==="正常"?"ok":"";
        button.lastChild.textContent=i.state+" · "+(i.latest.ms==null?"—":i.latest.ms+" ms");
    }
    text("name",item.name+" · 响应趋势");text("scope",item.scope);text("state",item.state);
    $("state").dataset.issue=item.state!=="正常";text("ms",item.latest.ms??"—");
    text("peak","时段峰值 "+(item.stats.peak==null?"—":item.stats.peak+" ms"));
    text("from",fmt(data.since,true));text("to",fmt(data.now,true));text("unit",data.bucket/60+" 分钟均值");
    text("hint",["故障","重试中"].includes(item.state)?item.impact+"。"+item.action:"");
    for(const id of ["events","samples"])$(id).setAttribute("aria-pressed",tab===id);
    records(item);draw();
}
async function refresh(){
    const epoch=++sequence;
    try{
        const response=await fetch("/api/status?window="+$("window").value,{signal:AbortSignal.timeout(8000)});
        if(!response.ok)throw Error();
        const result=await response.json();if(epoch!==sequence)return;
        data=result;show();text("stamp","更新于 "+fmt(data.now));
    }catch{
        if(epoch===sequence)text("stamp",data?"刷新失败 · 显示上次结果":"状态暂时不可用");
    }
}
for(const id of ["events","samples"])$(id).onclick=()=>{tab=id;if(data)show();};
$("window").onchange=refresh;
new ResizeObserver(draw).observe($("chart"));
refresh();setInterval(()=>{if(!document.hidden)refresh();},15000);
