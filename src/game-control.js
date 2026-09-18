const crypto = require('node:crypto');
function controlVersion(state) {
  return crypto.createHash('sha256').update(JSON.stringify([state.gameId,state.running,state.phase,state.round,state.deadline,state.endsAt,state.nextQuestionAt,state.timings,state.roundCount])).digest('hex').slice(0,24);
}
module.exports = { controlVersion };
