declare module 'solarlunar' {
  export interface LunarInfo {
    lYear: number;
    lMonth: number;
    lDay: number;
    animalStr: string;
    monthCn: string;
    dayCn: string;
    gzYear: string;
    gzMonth: string;
    gzDay: string;
    festivalStr: string;
    termStr: string;
    lunarFestivalStr: string;
    [key: string]: string | number | boolean | undefined;
  }
  export function solar2lunar(y: number, m: number, d: number): LunarInfo | false;
  const _default: {
    solar2lunar: typeof solar2lunar;
    lunar2solar: (y: number, m: number, d: number, isLeapMonth?: boolean) => LunarInfo | false;
  };
  export default _default;
}
