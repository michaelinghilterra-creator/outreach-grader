const LEVELS = ['ic', 'manager', 'director', 'vp', 'c_suite'];
const FUNCTIONS = ['sales', 'revops', 'marketing', 'finance', 'hr', 'engineering', 'other'];
const INDUSTRIES = ['saas', 'financial_services', 'healthcare', 'manufacturing', 'professional_services', 'other', null];
const CHANNELS = ['cold_email', 'linkedin_dm', 'linkedin_connection'];
const CTAS = ['meeting', 'reply', 'resource', 'referral', 'connect'];

export function validateGrade(body) {
  if (!body || typeof body !== 'object') return 'Invalid request body.';
  const { message, subject_line, recipient_level, recipient_function, industry, channel, cta_type } = body;

  if (!message || typeof message !== 'string' || !message.trim()) return 'Message is required.';
  if (message.length > 5000) return 'Message must be under 5000 characters.';
  if (!LEVELS.includes(recipient_level)) return 'Invalid recipient_level.';
  if (!FUNCTIONS.includes(recipient_function)) return 'Invalid recipient_function.';
  if (!INDUSTRIES.includes(industry ?? null)) return 'Invalid industry.';
  if (!CHANNELS.includes(channel)) return 'Invalid channel.';
  if (!CTAS.includes(cta_type)) return 'Invalid cta_type.';
  if (channel === 'cold_email') {
    if (!subject_line || typeof subject_line !== 'string' || !subject_line.trim()) {
      return 'subject_line is required for cold email.';
    }
    if (subject_line.length > 200) return 'Subject line must be under 200 characters.';
  }
  return null;
}

export function validateRewrite(body) {
  const base = validateGrade(body);
  if (base) return base;
  if (!body.score_result || typeof body.score_result !== 'object') return 'score_result is required.';
  if (typeof body.score_result.overall_score !== 'number') return 'score_result.overall_score must be a number.';
  if (!Array.isArray(body.score_result.top_fixes)) return 'score_result.top_fixes must be an array.';
  return null;
}
