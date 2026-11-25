import type {AssetIcon} from '@/lib/asset-map';
// Top-view plan symbols. Inner details distinguish similar footprints.
const shapes:Record<AssetIcon,{path:string;fill?:string}>={
 desk:{path:'M3 7H29V25H3Z'},
 deskL:{path:'M3 3H29V14H14V29H3Z'},
 roundTable:{path:'M29 16A13 13 0 1 1 3 16A13 13 0 1 1 29 16Z'},
 chair:{path:'M12 8H20Q25 8 25 13V22Q25 27 20 27H12Q7 27 7 22V13Q7 8 12 8ZM5 8Q16 1 27 8M4 12V22M28 12V22',fill:'#e5ad68'},
 bench:{path:'M2 10H10V25H2ZM12 10H20V25H12ZM22 10H30V25H22ZM2 7H10M12 7H20M22 7H30',fill:'#e5ad68'},
 shelf:{path:'M2 8H30V24H2ZM4 11H28M4 21H28M10 11V21M21 11V21'},
 cabinet:{path:'M2 6H30V26H2ZM3 23H29M16 23V26M10 25H13M19 25H22'},
 file:{path:'M6 3H26V29H6ZM7 25H25M13 27H19'},
 partition:{path:'M2 13H30V19H2ZM5 9V23M27 9V23'},
 cpuStand:{path:'M6 3H26V29H6ZM9 6H23V26H9ZM4 6V10M28 6V10M4 23V27M28 23V27'},
 footrest:{path:'M3 7H29V25H3ZM7 11H25M7 15H25M7 19H25'},
 board:{path:'M2 12H30V17H2ZM5 20H27M6 17V20M26 17V20',fill:'#ffffff'},
 fridge:{path:'M5 3H27V29H5ZM6 25H26M9 27H15'},
 ups:{path:'M7 3H25V29H7ZM10 7H22M10 10H22M10 13H22M14 25H18'},
 shredder:{path:'M5 4H27V28H5ZM9 11H23M9 13H23M22 7H24'},
 projector:{path:'M3 6H29V27H3ZM7 3H15V6H7ZM23 12V21M26 12V21M9 16H13V20H9Z'},
 computer:{path:'M8 2H24V30H8ZM11 6H21M11 9H21M9 26H23M18 28H20'},
 monitor:{path:'M9 19H23V25H9ZM13 14H19V21H13ZM2 8H30V14H2ZM4 12H28'},
 network:{path:'M2 7H30V25H2ZM5 10H27M5 13H27M5 20H8M11 20H14M17 20H20M23 20H26'},
 drive:{path:'M7 3H25V29H7ZM10 7H22M13 1H19M20 25H22'},
 air:{path:'M2 8H30V24H2ZM5 12H27M5 16H27M5 20H27'},
 water:{path:'M5 3H27V29H5ZM24 13A8 8 0 1 1 8 13A8 8 0 1 1 24 13ZM20 13A4 4 0 1 1 12 13A4 4 0 1 1 20 13ZM11 26V28M21 26V28',fill:'#b3d7ed'},
 fire:{path:'M26 18A10 10 0 1 1 6 18A10 10 0 1 1 26 18ZM14 8V3H21M20 4Q30 6 28 20',fill:'#d77a6f'},
 printer:{path:'M3 8H29V29H3ZM7 2H25V14H7ZM9 22H23M9 25H23M24 18H26'},
 other:{path:'M4 4H28V28H4ZM4 4L28 28M28 4L4 28'}
};
export default function AssetSymbol({kind,size=24}:{kind:AssetIcon;size?:number}){
 const shape=shapes[kind];
 const furniture=['desk','deskL','roundTable','shelf','cabinet','file','partition'];
 return <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true"><path d={shape.path} fill={shape.fill||(furniture.includes(kind)?'#cee1ef':'#b3c3d1')} stroke="#345a7d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
