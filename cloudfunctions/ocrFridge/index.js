const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const SECRET_ID = process.env.TC_SECRET_ID
const SECRET_KEY = process.env.TC_SECRET_KEY
const HOST = 'ocr.tencentcloudapi.com'
const SERVICE = 'ocr'
const REGION = 'ap-guangzhou'
const VERSION = '2018-11-19'
const ACTION = 'GeneralBasicOCR'

function sign(secretKey, message) {
  return crypto.createHmac('sha256', secretKey).update(message).digest()
}

async function callTencentOCR(imageUrl) {
  const timestamp = Math.floor(Date.now() / 1000)
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
  const payload = JSON.stringify({ ImageUrl: imageUrl, LanguageType: 'zh' })
  const hashedPayload = crypto.createHash('sha256').update(payload).digest('hex')

  const canonicalRequest = [
    'POST', '/', '',
    'content-type:application/json; charset=utf-8\nhost:' + HOST + '\n',
    'content-type;host',
    hashedPayload,
  ].join('\n')

  const credentialScope = `${date}/${SERVICE}/tc3_request`
  const hashedCanonical = crypto.createHash('sha256').update(canonicalRequest).digest('hex')
  const stringToSign = ['TC3-HMAC-SHA256', timestamp, credentialScope, hashedCanonical].join('\n')

  const secretDate = sign('TC3' + SECRET_KEY, date)
  const secretService = sign(secretDate, SERVICE)
  const secretSigning = sign(secretService, 'tc3_request')
  const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex')

  const authorization = `TC3-HMAC-SHA256 Credential=${SECRET_ID}/${credentialScope}, SignedHeaders=content-type;host, Signature=${signature}`

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: HOST,
      method: 'POST',
      path: '/',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Host': HOST,
        'X-TC-Action': ACTION,
        'X-TC-Version': VERSION,
        'X-TC-Timestamp': String(timestamp),
        'X-TC-Region': REGION,
        'Authorization': authorization,
      },
    }, res => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

exports.main = async (event) => {
  const { fileID } = event
  if (!fileID) return { error: 'missing fileID' }
  if (!SECRET_ID || !SECRET_KEY) return { error: 'missing TC credentials' }

  const urlRes = await cloud.getTempFileURL({ fileList: [fileID] })
  const tempUrl = urlRes.fileList && urlRes.fileList[0] && urlRes.fileList[0].tempFileURL
  if (!tempUrl) return { error: 'get temp url failed' }

  const result = await callTencentOCR(tempUrl)
  const textDetections = (result.Response && result.Response.TextDetections) || []

  // 识别完即删临时图，避免 ocr-tmp/ 在云存储里无限累积
  try { await cloud.deleteFile({ fileList: [fileID] }) } catch (e) {}

  return { textDetections }
}
