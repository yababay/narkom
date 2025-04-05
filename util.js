export const getPrefix = (prefix, num, z = 3) => {
    let zeroed = '' + num
    while(zeroed.length < z) zeroed = `0${zeroed}`
    return `${prefix}:${zeroed}`
}

export const iso2ru = (iso) => new Date(iso).toLocaleDateString('ru-RU', {year: 'numeric', month: 'long', day: 'numeric'})
  
export const ru2iso = (ru) => {
    const arr = /(\d+)\s+([а-я]+)\s+(\d+)/.exec(ru.trim()) || []
    const [ _, dd, mmm, yyyy ] = arr
    if(!(dd && mmm && yyyy)) throw 'bad date ' + ru
    const getMonth = () => {
      switch(mmm){
        case 'января': return '01'
        case 'февраля': return '02'
        case 'марта': return '03'
        case 'апреля': return '04'
        case 'мая': return '05'
        case 'июня': return '06'
        case 'июля': return '07'
        case 'августа': return '08'
        case 'сентября': return '09'
        case 'октября': return '10'
        case 'ноября': return '11'
        case 'декабря': return '12'
        default: throw 'no month'                                                                                                                                        }
    }
    return `${yyyy}-${getMonth()}-${+dd < 10 ? '0' : '' }${dd}`
}

