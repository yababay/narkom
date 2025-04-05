import redis from 'redis'
import { iso2ru, getPrefix } from './util.js'

const client = redis.createClient({url: `redis://localhost:${process.env.REDIS_PORT || 6378}`})
await client.connect()

const transits = new Map()
const notLaterThan = new Date('1939-01-01')
const notEarlyThan = new Date('1917-10-01')

const filterTransit = (orgs) => {
    if(orgs.length > 2) return true
    for(const key of orgs){
        const [ org, id, from, to ] = key.split(':')
        const fromDate = new Date(from).getTime()
        if((notLaterThan - fromDate) < 0) continue // too late
        if((fromDate - notEarlyThan) < 0) continue // too early
        const toDate = new Date(to).getTime()
        const duration = (toDate - fromDate) / (1000 * 3600 * 24) // days
        if(Math.abs(duration) > 366) return true
    }
    return false
}

;(async () => {
    try {
        const orgs = await client.keys('organisation:*')
        for(const org of orgs.filter(el => el.includes('-'))) {
            const pers = await client.get(org)
            let arr = transits.has(pers) ? transits.get(pers) : []
            arr.push(org)
            transits.set(pers, arr)
        }
        const filtered = Array.from(transits.entries()).filter(([_, orgs]) => filterTransit(orgs))
        for(const trans of filtered){
            const [ key, orgs ] = trans
            const pers = getPrefix('person', +key, 7)
            const first = await client.hGet(pers, 'first_name')
            const rest = await client.hGet(pers, 'rest_name')
            const arr = /.*([А-Я]).*([А-Я])/.exec(rest)
            const person = `${first} ${arr[1]}.${arr[2]}.`
            //console.log(person, orgs)
            const organisations = new Set()
            const arrows = []
            for(const org of orgs){
                const [ prefix, id, from, to ] = org.split(':')
                const title = (await client.get(`${prefix}:${id}`))
                .replace('Народный комиссариат', 'НК')
                .replace('Высший совет народного хозяйства (ВСНХ) СССР', 'ВСНХ СССР')
                .replace('Высший совет народного хозяйства (ВСНХ) РСФСР', 'ВСНХ РСФСР')
                .replace('нефтяной промышленности', 'нефт. пром.')
                .replace('тяжёлой промышленности', 'тяж. пром.')
                .replace('авиационной промышленности', 'авиа. пром.')
                .replace('топливной промышленности', 'топл. пром.')
                .replace('оборонной промышленности', 'оборон. пром.')
                organisations.add(title)
                arrows.push(`->${title}:${iso2ru(from)}`)
                arrows.push(`<-${title}:${iso2ru(to)}`)
            }
            const participants = [person, ...organisations]
            console.log(`title ${first} ${rest}\n`)
            participants.map(el => `participant ${el}`).forEach(el => console.log(el))
            arrows.map(el => `${person}${el}`).forEach(el => console.log(el))
            console.log('===========================')
        }
        //const participants = [...persons, ...organisations]
        //participants.map(el => `participant ${el}`).forEach(el => console.log(el))
    } catch (e) {
        console.log(`Error: ${e}`)
    } finally {
        await client.quit()
    }
})()
