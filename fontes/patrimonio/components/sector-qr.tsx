'use client';
import {useEffect,useState} from 'react';
import QRCode from 'qrcode';
export default function SectorQR({id,name}:{id:string;name:string}){
 const [src,setSrc]=useState('');
 useEffect(()=>{let alive=true;QRCode.toDataURL(`${location.origin}${location.pathname}?area=${encodeURIComponent(id)}`,{width:200,margin:2,errorCorrectionLevel:'M'}).then(url=>{if(alive)setSrc(url);}).catch(()=>{});return()=>{alive=false;};},[id]);
 return src?<img src={src} alt={'QR Code para '+name}/>:<p>Preparando QR…</p>;
}

