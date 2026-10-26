import React,{useEffect,useRef,useState} from 'react';
import {Alert,Button,Form,Input,InputNumber,Modal,Space,Typography} from 'antd';
import {buildCollectionUrl,collectionHandoff,collectionParameters} from './collection-handoff.mjs';
import {requestCollection} from './collection-launch.mjs';
import {validBossExtensionId} from './greet-launch.mjs';
export default function CollectionDialog({demo=false}){
 const [open,setOpen]=useState(false),[expect,setExpect]=useState(1),[pages,setPages]=useState(20),
  [extensionId,setExtensionId]=useState(''),[repoRoot,setRepoRoot]=useState(''),[error,setError]=useState(''),
  [launched,setLaunched]=useState(null),[copied,setCopied]=useState(false),[busy,setBusy]=useState(false);
 const attempt=useRef(null);
 useEffect(()=>{
  const receive=e=>{if(e.source===window&&e.origin===location.origin&&e.data?.type==='FINDWORK_BOSS_EXTENSION_INFO'&&validBossExtensionId(e.data.extensionId)&&e.data.capabilities?.includes('detail-collection-launch-v2'))setExtensionId(e.data.extensionId);};
  window.addEventListener('message',receive);window.postMessage({type:'FINDWORK_BOSS_EXTENSION_INFO_PING'},location.origin);
  return()=>window.removeEventListener('message',receive);
 },[]);
 useEffect(()=>{if(!open)return;let active=true;
  setCopied(false);window.postMessage({type:'FINDWORK_BOSS_EXTENSION_INFO_PING'},location.origin);
  fetch('/api/workspace').then(async r=>{if(!r.ok)throw Error('无法读取本机项目路径');return r.json();}).then(p=>{if(active)setRepoRoot(p.repoRoot);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};
 },[open]);
 let params=null,prompt='';try{params=collectionParameters(expect,pages);prompt=collectionHandoff(launched||attempt.current||{repoRoot,expect,pages});}catch{}
 const changed=(setter,value)=>{setter(value);setCopied(false);};
 const start=async()=>{
  if(busy)return;setError('');setBusy(true);
  try{
   if(demo)throw Error('演示模式不能启动真实采集');
   if(launched)throw Error('本次入口已打开，请先核查采集进度，不要重复启动');
   buildCollectionUrl(extensionId,expect,pages); // Shared numeric/identity validation, no window.open.
   if(!repoRoot)throw Error('本机项目路径尚未读取完成');
   attempt.current??={repoRoot,expect,pages,requestId:crypto.randomUUID()};
   const result=await requestCollection('FINDWORK_COLLECTION_LAUNCH',{...attempt.current,extensionId});
   if(result.requestId!==attempt.current.requestId||result.expect!==attempt.current.expect||result.pages!==attempt.current.pages||!Number.isFinite(Date.parse(result.startedAt)))throw Object.assign(Error('采集启动身份尚未确认，请核查原页面'),{code:'COLLECTION_OPEN_UNCONFIRMED'});
   setLaunched({...attempt.current,startedAt:result.startedAt});setCopied(false);
  }catch(e){
   setError(e.message);
   if(e.code&&!['COLLECTION_OPEN_UNCONFIRMED','COLLECTION_BRIDGE_TIMEOUT','COLLECTION_STATE_UNAVAILABLE'].includes(e.code))attempt.current=null;
  }finally{setBusy(false);}
 };
 const prepareNext=async()=>{
  if(busy)return;setBusy(true);setError('');
  try{
   const r=await requestCollection('FINDWORK_COLLECTION_STATUS',{extensionId,requestId:crypto.randomUUID()});
   if(!r.canStart)throw Error(({COLLECTION_RUNNING:'本批仍在采集，请先等待完成。',COLLECTION_START_PENDING:'本次启动尚待核查，请查看扩展页。',COLLECTION_DOWNLOAD_PENDING:'还有下载待结算。',GREET_RUNNING:'沟通任务尚未结束。'})[r.reason]||r.reason||'当前不能开始下一批');
   attempt.current=null;setLaunched(null);setCopied(false);
  }catch(e){setError(e.message);}finally{setBusy(false);}
 };
 const copy=async()=>{try{await navigator.clipboard.writeText(prompt);setCopied(true);setError('');}catch{setError('未能写入剪贴板，请选中下方提示词手动复制');}};
 return <><Button type="primary" onClick={()=>{setError('');setOpen(true);}}>采集岗位</Button>
  <Modal title="采集岗位" open={open} onCancel={()=>setOpen(false)} width={720} footer={<Space><Button onClick={()=>setOpen(false)}>关闭</Button><Button disabled={busy||!extensionId||demo} onClick={prepareNext}>核查并准备下一批</Button><Button type="primary" onClick={start} loading={busy} disabled={busy||!params||!repoRoot||!extensionId||demo||!!launched}>{launched?'采集入口已打开':attempt.current?'核查本次启动':'确认并打开扩展采集页'}</Button></Space>}>
   <Alert type="info" showIcon title="请先确认当前 Chrome 已登录 BOSS，并保留唯一的职位列表页；不要同时启动另一批采集。" description="确认后由扩展采集列表和详情、下载 JSON。文件全部下载完成后，复制下方提示词交给 AI 入库、去重和评估；不会自动沟通或投递简历。"/>
   {error&&<Alert type="error" showIcon title={error} style={{marginTop:12}}/>}
   {launched&&<Alert type="success" showIcon title="采集入口已打开，尚不代表采集完成" description="请等待扩展确认文件下载完成，再复制提示词交给 AI。提示词已保留本次参数和开始时间。" style={{marginTop:12}}/>}
   <Form layout="vertical" style={{marginTop:16}}>
    <Form.Item label="求职期望序号" extra="1、2、3 对应账号中的求职期望一、二、三。"><InputNumber aria-label="求职期望序号" min={1} max={99} precision={0} value={expect} onChange={v=>changed(setExpect,v)} disabled={busy||!!launched||!!attempt.current}/></Form.Item>
    <Form.Item label="采集页数" extra={params?`每页15条，预计采集 ${params.expectedCount} 条；实际数量以有效下载为准。`:'请输入1～21页。'}><InputNumber aria-label="采集页数" min={1} max={21} precision={0} value={pages} onChange={v=>changed(setPages,v)} disabled={busy||!!launched||!!attempt.current}/></Form.Item>
    <Form.Item label="采集完成后交给 AI 的提示词" extra="启动后会记录本次参数和时间；等待下载完成再交给 AI 执行。"><Input.TextArea aria-label="采集完成后交给 AI 的提示词" value={prompt||'填写有效参数并等待读取本机项目路径后，将生成提示词。'} readOnly autoSize={{minRows:7,maxRows:12}}/><Button style={{marginTop:8}} onClick={copy} disabled={!prompt}>{copied?'已复制提示词':'复制提示词'}</Button></Form.Item>
   </Form>
   <Typography.Text type="secondary">{demo?'演示模式不启动真实采集。':extensionId?'采集扩展已连接。':'尚未连接支持此入口的扩展，请检查当前 Chrome 的扩展版本。'}</Typography.Text>
  </Modal></>;
}
