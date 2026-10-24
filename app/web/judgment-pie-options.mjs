const STATUS_COLORS=['#397dd4','#e5a04c','#329e81','#acbbcd'];
export function makeJudgmentPieOptions(entries,chartName="岗位判断分布"){
 const data=entries.map((entry,i)=>({
  name:entry.label,value:Math.max(0,Number(entry.value)||0),
  itemStyle:{color:STATUS_COLORS[i%STATUS_COLORS.length]}
 }));
 const total=data.reduce((sum,entry)=>sum+entry.value,0);
 return{
  animationDuration:250,
  aria:{enabled:true,description:chartName+'，'+data.map(d=>d.name+d.value+'条').join('，')},
  tooltip:{trigger:'item',confine:true,formatter:({name,value,percent})=>name+'<br/>'+value+' 条（'+percent+'%）'},
  legend:{
   orient:'horizontal',left:'center',bottom:7,itemWidth:9,itemHeight:9,itemGap:data.length>3?5:12,
   icon:'circle',selectedMode:false,
   textStyle:{fontSize:11,color:'#516682'},
   formatter:name=>{
    const value=data.find(item=>item.name===name)?.value||0;
    return (data.length>3&&name==='其他/未提供'?'其他':name)+' '+value+' ('+(total?Math.round(value*100/total):0)+'%)';
   }
  },
  series:[{
   name:'岗位判断',type:'pie',radius:['46%','66%'],center:['50%','40%'],
   clockwise:true,stillShowZeroSum:false,avoidLabelOverlap:true,
   label:{show:false},labelLine:{show:false},
   itemStyle:{borderWidth:1,borderColor:'#fff'},
   emphasis:{scale:true,scaleSize:3},
   data
  }]
 };
}
