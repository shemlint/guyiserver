const os = require('os')
const https = require('https')
const fs = require('fs')
const path = require('path')

const { WebSocketServer } = require('ws')
const { Signale } = require('signale')
const prompts = require('prompts')
const kleur = require('kleur')
const Conf = require('conf')
const express = require('express')
const opener = require('opener')

const signale = new Signale({
    types: {
        sends: {
            badge: '<<',
            color: 'yellow',
            label: 'update',
            logLevel: 'info',
        }
    }
})
const config = new Conf()


const getAddresses = () => {
    let ips = []
    for (let type of Object.keys(os.networkInterfaces())) {
        let items = os.networkInterfaces()[type]
        items.forEach(i => {
            if (!i.internal && i.family === 'IPv4') {
                ips.push(i.address)
            }
        })
    }
    return ips
}
const ips = getAddresses()
let PORT = 8080
function runWss() {
    const server = https.createServer({
        key: fs.readFileSync(path.join(__dirname, '../key.pem')),
        cert: fs.readFileSync(path.join(__dirname, '../cert.pem')),
        passphrase: 'zaina',

    })

    const wss = new WebSocketServer({ port: PORT })//specify server to use https

    let APP = config.get('app', {})

    const sendUpdate = (app, originWs) => {
        let sends = 0
        let clients = [...wss.clients]
        clients.forEach(ws => {
            try {
                if (ws.useUpdate === false || ws === originWs) {
                    return
                }
                ws.send(JSON.stringify({
                    type: 'reload',
                    app
                }))
                sends++
            } catch (e) {
                signale.warn(kleur.cyan('Could not send reload to a runner. ' +
                    e.message))
            }

        })
        let d = new Date()
        signale.sends(kleur.magenta(`Update send to ${kleur.cyan(`${sends}`)} runners. ${d.getHours() + ':' + d.getMinutes() + '.' + d.getMilliseconds()}`))
        config.set('app', app)
    }

    wss.on('connection', (ws, req) => {
        ws.connectType = 'runner'
        ws.useUpdate = true
        signale.info(kleur.yellow('Got new connection'))

        ws.on('message', (mes) => {
            try {
                mes = mes.toString('utf8')
                mes = JSON.parse(mes)
                if (mes.type === 'update') {
                    if (mes.app && Array.isArray(mes.app.modules)) {
                        APP = mes.app
                        ws.connectType = 'client'
                        sendUpdate(mes.app, ws)
                    } else {
                        signale.error('Got wrong app Format')
                    }
                }
                if (mes.type === 'get') {
                    ws.send(JSON.stringify({
                        type: 'getresult',
                        app: APP
                    }))
                }
                if (mes.type === 'useupdate') {
                    if (ws.useUpdate !== (!!mes.data)) {
                        ws.useUpdate = mes.data
                        if (!!mes.data) {
                            signale.info(kleur.green(`A ${ws.connectType} started  listening.`))
                        } else {
                            signale.warn(kleur.green(`A ${ws.connectType} stopped listening.`))
                        }
                    }
                }

            } catch (e) {
                signale.log('message error ' + e.message)
            }
        })
        ws.on('close', () => {
            let type = ws.connectType
            signale.info(kleur.magenta(`A ${type} -disconnected`))
            let clients = [...wss.clients]
            if (clients.length === 0) {
                signale.info(kleur.bgYellow('No connection to Server'))
            }

        })

    })
    wss.on('close', () => {
        signale.info('Closing')

    })
    wss.on('error', (e) => {
        if (e.code === 'EADDRINUSE') {
            signale.warn(kleur.yellow(`Server:Port ${PORT} in use,tying ${++PORT}`))
            runWss()
        } else {
            signale.fatal('Error : ' + e.message)
        }
    })
    wss.on("listening", (e) => {

        signale.success(`Guyi ws server at :\t${kleur.underline().blue(`ws://localhost:${PORT}`)} (this Computer)` +
            `or ${kleur.underline().blue(ips[0] ? 'ws://' + ips[0] + ':' + PORT : "NONE")}  (network)`)

    })
}
let PORT2 = 5000

function runGuyi() {
    let app = express()
    app.use(express.static(path.join(__dirname, '../guyi')))
    app.get('/', (req, res) => {
        //res.sendFile(path.join(__dirname, './guyi/index.html'))
        let p = path.join(__dirname, '../guyi/index.html')
        console.log('path is ', p)
        res.sendFile(p)
    })
    app.on('error', (e) => {
        console.log('error', e)
    })
    app.listen(PORT2, () => {
        signale.success(kleur.yellow('Guyi Editor running at ' + kleur.magenta(`http://localhost:${PORT2}`) +
            ' or ' + kleur.magenta(ips[0] ? `http://${ips[0]}:${PORT2}` : "NONE")))
        openSite()
    })
        .on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                signale.warn(kleur.cyan(`EDITOR:Port ${PORT2} in use,trying ${++PORT2}`))
                runGuyi()
                openSite()
            } else {
                signale.fatal('Error : ' + e.message)
            }
        })
    function openSite() {
        try {
            let edit = opener('http://localhost:' + PORT2)
            edit.unref()
            edit.stdin.unref()
            edit.stdout.unref()
            edit.stderr.unref()
        } catch (e) {
            signale.fatal(kleur.red('Could not open Editor.Visit url manually.'))
        }
    }

}
async function getInput() {
    let res = await prompts({
        type: 'select',
        name: 'action',
        message: '>>',
        choices: [
            { title: 'create' },
            { title: 'delete' },
            { title: 'update' },
        ]

    })
    console.log('Got away we go', res)

    setTimeout(getInput, 500)
}

runWss()
runGuyi()
getInput()
