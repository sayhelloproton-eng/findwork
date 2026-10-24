const COLORS={received:'#397dd4',communicated:'#329e81'};
const axisStyle={axisTick:{show:false},axisLine:{lineStyle:{color:'#e0e7ef'}},axisLabel:{color:'#7a8da7',fontSize:10}};
const line={type:'line',smooth:false,showSymbol:false,symbolSize:5,lineStyle:{width:2.5},emphasis:{focus:'series'}};
export function makeCumulativeOptions(weeks=[]){
 return{
  animationDuration:220,aria:{enabled:true,description:'近十三周累计收录及累计沟通趋势'},
  color:[COLORS.received,COLORS.communicated],
  tooltip:{trigger:'axis',confine:true,axisPointer:{type:'line'}},
  legend:{left:'center',bottom:7,orient:'horizontal',itemWidth:17,itemHeight:7,textStyle:{fontSize:11,color:'#516682'}},
  grid:{top:18,left:35,right:9,bottom:55},
  xAxis:{type:'category',boundaryGap:false,data:weeks.map(w=>w.label),...axisStyle,axisLabel:{...axisStyle.axisLabel,interval:2}},
  yAxis:{type:'value',min:0,minInterval:1,splitLine:{lineStyle:{color:'#eef2f7'}},...axisStyle},
  series:[
   {name:'累计收录',...line,data:weeks.map(w=>w.receivedTotal||0)},
   {name:'累计沟通',...line,data:weeks.map(w=>w.communicatedTotal||0)}
  ]
 };
}
export function makeDailyStackedOptions(days=[]){
 return{
  animationDuration:220,aria:{enabled:true,description:'每日新增收录和每日成功沟通，以两类业务事件堆叠展示'},
  color:[COLORS.received,COLORS.communicated],
  tooltip:{trigger:'axis',confine:true,axisPointer:{type:'shadow'}},
  legend:{left:'center',bottom:7,orient:'horizontal',itemWidth:11,itemHeight:9,textStyle:{fontSize:11,color:'#516682'}},
  grid:{top:18,left:35,right:9,bottom:55},
  xAxis:{type:'category',data:days.map(d=>d.label),...axisStyle,axisLabel:{...axisStyle.axisLabel,interval:1}},
  yAxis:{type:'value',min:0,minInterval:1,splitLine:{lineStyle:{color:'#eef2f7'}},...axisStyle},
  series:[
   {name:'每日收录',type:'bar',stack:'daily',barMaxWidth:16,data:days.map(d=>d.received||0)},
   {name:'每日沟通',type:'bar',stack:'daily',barMaxWidth:16,data:days.map(d=>d.communicated||0)}
  ]
 };
}
