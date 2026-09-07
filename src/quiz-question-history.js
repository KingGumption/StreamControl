const { getConfigValue, setConfigValue } = require('./db');
const KEY = 'quiz_question_history_v1';
function loadQuestionHistory() {
  const value = getConfigValue(KEY, []);
  return Array.isArray(value) ? value.filter(id=>typeof id==='string') : [];
}
function saveQuestionHistory(ids) { setConfigValue(KEY, ids); }
module.exports = { loadQuestionHistory, saveQuestionHistory };
