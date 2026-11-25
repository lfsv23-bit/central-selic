import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import Home from './app/inventory-home';
import './app/globals.css';
import {installBridge,client} from './supabase-bridge';
installBridge();
function App(){const [session,setSession]=useState<any>(null),[ready,setReady]=useState(false),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState('');useEffect(()=>{client.auth.getSession().then(({data}:any)=>{setSession(data.session);setReady(true)});const {data}=client.auth.onAuthStateChange((_event:any,s:any)=>setSession(s));return()=>data.subscription.unsubscribe()},[]);if(!ready)return <p>Carregando…</p>;if(session)return <Home signInHref="../../"/>;return <main><h1>Patrimônio · Central SELIC</h1><p>Entre com sua conta da Central SELIC.</p><form onSubmit={async e=>{e.preventDefault();const {error}=await client.auth.signInWithPassword({email,password});setError(error?.message||'')}}><label>E-mail<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Senha<input type="password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button type="submit">Entrar</button><p role="alert">{error}</p></form></main>}
createRoot(document.getElementById('root')!).render(<App/>);
