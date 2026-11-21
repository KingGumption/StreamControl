const crypto=require('node:crypto');

function streamerBotAuthentication(password, authentication) {
  const secret = crypto.createHash('sha256')
    .update(`${password}${authentication.salt}`, 'utf8')
    .digest('base64');
  return crypto.createHash('sha256')
    .update(`${secret}${authentication.challenge}`, 'utf8')
    .digest('base64');
}

module.exports={streamerBotAuthentication};
