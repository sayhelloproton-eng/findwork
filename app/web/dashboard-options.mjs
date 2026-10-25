const COLORS={received:'#397dd4',communicated:'#329e81'};
const axisStyle={axisTick:{show:false},axisLine:{lineStyle:{color:'#e0e7ef'}},axisLabel:{color:'#7a8da7',fontSize:10}};
const line={type:'line',smooth:false,connectNulls:false,showSymbol:true,symbolSize:5,lineStyle:{width:2.5},emphasis:{focus:'series'}};
const frame={grid:{top:18,left:34,right:8,bottom:52},yAxis:{type:'value',min:0,minInterval:1,splitLine:{lineStyle:{color:'#eef2f7'}},...axisStyle}};
const note=d=>d.coverage==='missing'?'无采集记录':d.coverage==='historical-partial'?'至少 '+(d.collected??0)+' 条（历史归档不完整）':(d.collected??0)+' 条';
export function makeDailyAppearanceOptions(days=[]){
 return{
  animationDuration:220,aria:{enabled:true,description:'每日较前一天新出现的岗位；无可比基线时不绘制零'},
  color:[COLORS.received],
  tooltip:{trigger:'axis',confine:true,formatter:items=>{
   const d=days[items?.[0]?.dataIndex??0];
   return d?d.date+'：'+(d.newComparedYesterday==null?'无可靠前日基线或采集范围不同':'较前日新出现 '+d.newComparedYesterday+' 条'):'';
  }},
  ...frame,grid:{...frame.grid,bottom:43},
  xAxis:{type:'category',boundaryGap:false,data:days.map(d=>d.label),...axisStyle,axisLabel:{...axisStyle.axisLabel,interval:2}},
  series:[{name:'较前一天新出现',...line,data:days.map(d=>d.newComparedYesterday??null)}]
 };
}
export function makeDailyCollectedAndGreetOptions(days=[]){
 return{
  animationDuration:220,aria:{enabled:true,description:'每天去重收录量和独立按成功时间计的沟通量，不堆叠'},
  color:[COLORS.received,COLORS.communicated],
  tooltip:{trigger:'axis',confine:true,axisPointer:{type:'shadow'},formatter:items=>{
   const d=days[items?.[0]?.dataIndex??0];
   return d?d.date+'<div>当日收录：'+note(d)+'</div><div>当日沟通：'+d.communicated+' 条</div>':'';
  }},
  legend:{left:'center',bottom:7,orient:'horizontal',itemWidth:11,itemHeight:9,textStyle:{fontSize:11,color:'#516682'}},
  ...frame,
  xAxis:{type:'category',data:days.map(d=>d.label),...axisStyle,axisLabel:{...axisStyle.axisLabel,interval:1}},
  series:[
   {name:'当日收录',type:'bar',barMaxWidth:13,data:days.map(d=>d.collected??null)},
   {name:'当天已沟通',type:'bar',barMaxWidth:13,data:days.map(d=>d.communicated)}
  ]
 };
}
