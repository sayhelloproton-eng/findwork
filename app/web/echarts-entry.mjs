import * as echarts from 'echarts/core';
import {PieChart,LineChart,BarChart} from 'echarts/charts';
import {LegendComponent,TooltipComponent,AriaComponent,GridComponent} from 'echarts/components';
import {CanvasRenderer} from 'echarts/renderers';

echarts.use([PieChart,LineChart,BarChart,LegendComponent,TooltipComponent,AriaComponent,GridComponent,CanvasRenderer]);
window.findworkEcharts=echarts;
