import { Builder, Browser, By } from 'selenium-webdriver'
import redis from 'redis'

const client = redis.createClient({url: `redis://localhost:${process.env.REDIS_PORT || 6378}`})
await client.connect()

const pairs = []

const BROWSER = process.env.BROWSER || 'FIREFOX'

const getPrefix = (prefix, num, z = 3) => {
  let zeroed = '' + num
  while(zeroed.length < z) zeroed = `0${zeroed}`
  return `${prefix}:${zeroed}`
}

const persons = new Map()
let personCount = 0

const savePersons = async (table) => {
  const tds = await table.findElements(By.css("td:nth-child(1)"))
  for(const t of tds) {
    let arr = /^(.*)\,([^\()]+)\(([^\)]+)/.exec(await t.getText()) || []
    const [ _, first, rest, dates ] = arr
    if(!(first && rest && dates)) continue
    arr = /(\d{4})\D(\d{4})/.exec(dates) || []
    const [ __, from, to ] = arr
    if(!(from && to)) continue
    const key = ++personCount // getPrefix('person', ++personCount, 7)
    persons.set(`${first.trim()} ${rest.trim()}`, {first: first.trim(), rest: rest.trim(), from, to, key})
  }
}

const saveSection = async (el) => {
  let title = await el.findElement(By.css('h2')) || await el.findElement(By.css('h3'))
  if(!title) throw 'no title'
  const table = await el.findElement(By.css(".wikitable"))
  if(!table) throw `no table ${title}`
  pairs.push({title: await title.getText(), table})
  await savePersons(table)
}

const ru2iso = (ru) => {
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

const saveOrg = async (pair, i) => {
  const org = getPrefix('organisation', i + 1, 7)
  const { title, table } = pair
  await client.set(org, title.trim())
  const tds = await table.findElements(By.css("td:nth-child(1)"))//.then(el => el.getText())
  const froms = await table.findElements(By.css("td:nth-child(2)"))//.then(el => el.getText())
  const tos = await table.findElements(By.css("td:nth-child(3)"))//.then(el => el.getText())
  let pos = 0
  const found = []
  for(const td of tds) {
    let arr = /^(.*)\,([^\()]+)\(([^\)]+)/.exec(await td.getText()) || []
    const [ _, first, rest ] = arr
    if(!(first && rest)) continue
    const key = `${first.trim()} ${rest.trim()}`
    const person = persons.get(key)
    if(!person) continue
    const from = ru2iso(await froms[pos].getText())
    const to = ru2iso(await tos[pos].getText())
    await client.set(`${org}:${from}:${to}`, person.key)
    pos++
  }
  return found
}

;(async () => {
  const driver = await new Builder().forBrowser(Browser[BROWSER]).build();
  try {
    await driver.get(`https://ru.ruwiki.ru/wiki/%D0%A1%D0%BF%D0%B8%D1%81%D0%BE%D0%BA_%D0%BC%D0%B8%D0%BD%D0%B8%D1%81%D1%82%D1%80%D0%BE%D0%B2_%D0%BF%D1%80%D0%BE%D0%BC%D1%8B%D1%88%D0%BB%D0%B5%D0%BD%D0%BD%D0%BE%D1%81%D1%82%D0%B8_%D0%A0%D0%BE%D1%81%D1%81%D0%B8%D0%B8`)
    await driver.sleep(5000)
    const RI = 'div.vue-article-body-container:nth-child(1)' 
    const VP = 'div.vue-article-body-container:nth-child(2)' 
    const RSFSR = 'div.vue-article-body-container:nth-child(3)' 
    const USSR = 'div.vue-article-body-container:nth-child(4)' 
    const NARKOMATS = 'div.vue-article-body-container:nth-child(5)' 

    const ri = await driver.findElement(By.css(RI))
    const vp = await driver.findElement(By.css(VP))
    const rsfsr = await driver.findElement(By.css(RSFSR))
    const ussr = await driver.findElement(By.css(USSR))
    const narkomats = await driver.findElement(By.css(NARKOMATS))

    if(!(ri && vp && rsfsr && ussr && narkomats)) throw 'something is not found'
    for(const el of [ri, vp, rsfsr, ussr]) await saveSection(el)

    const narkomatNames = await narkomats.findElements(By.css("h3"))
    const narkomatTables = await narkomats.findElements(By.css(".wikitable"))

    let narkomatCount = 0

    for(const name of narkomatNames){
      const title = await name.getText()
      const table = narkomatTables[narkomatCount]
      await savePersons(table)
      narkomatCount++
      if(title.includes('станкостроения')) narkomatCount++
      pairs.push({title, table})
    }

    for(const person of Array.from(persons.values()).sort((a, b) => a.key - b.key < 0 ? -1 : 1 )) {
      let { key, first, rest, from, to} = person
      await client.set('persons:count', key)
      key = getPrefix(`person`, key, 7)
      await client.hSet(key, 'first_name', first)
      await client.hSet(key, 'rest_name', rest)
      await client.hSet(key, 'from_year', from)
      await client.hSet(key, 'to_year', to)
    }
    await Promise.all(pairs.map(saveOrg))    
  } catch (e) {
    console.log(`Error: ${e}`)
  } finally {
    await driver.quit()
    await client.save()
    await client.quit()
  }
})()
