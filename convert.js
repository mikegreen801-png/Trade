const fs = require('fs');
let html = fs.readFileSync('tradingview_course.html', 'utf8');

// Extract the content inside <div class="container">
const start = html.indexOf('<div class="container">');
const end = html.indexOf('<footer>');
let content = html.substring(start, end);

// Replace the old inline styles with tokens where possible or keep it simple
let template = `
<section class="page-hero">
  <div class="hero-block">
    <span class="eyebrow">Education</span>
    <h1>TradingView Crash Course</h1>
    <p class="lead">Master the platform in 30 minutes • Start paper trading today</p>
  </div>
</section>

<section class="market-grid">
  <article class="surface section-anchor stack" style="grid-column: span 2;">
    <div class="nav-tabs" style="display:flex; gap:8px; margin-bottom: 24px; flex-wrap: wrap;">
        <button class="secondary-btn active" onclick="switchModule('basics')">1. Basics</button>
        <button class="secondary-btn" onclick="switchModule('charttypes')">2. Chart Types</button>
        <button class="secondary-btn" onclick="switchModule('patterns')">3. Candlestick Patterns</button>
        <button class="secondary-btn" onclick="switchModule('indicators')">4. Indicators</button>
        <button class="secondary-btn" onclick="switchModule('setup')">5. Setup & Trade</button>
        <button class="secondary-btn" onclick="switchModule('checklist')">6. Checklist</button>
    </div>
    
    <div class="course-content">
      ${content}
    </div>
  </article>
</section>
`;

// Some quick replacements to make it look like the site
template = template.replace(/<header>[\s\S]*?<\/header>/g, '');
template = template.replace(/<div class="nav-tabs">[\s\S]*?<\/div>/g, '');
template = template.replace(/class="section"/g, 'style="margin-bottom: 32px;"');
template = template.replace(/class="section-title"/g, 'style="font-size: 20px; font-weight: 600; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid var(--border);"');
template = template.replace(/class="lesson"/g, 'style="margin-bottom: 24px;"');
template = template.replace(/class="lesson-title"/g, 'style="font-size: 16px; font-weight: 600; margin-bottom: 8px; color: var(--blue);"');
template = template.replace(/class="step-box"/g, 'style="background: var(--bg-soft); padding: 16px; border-radius: 8px; margin-bottom: 12px; display: flex; gap: 12px; align-items: flex-start;"');
template = template.replace(/class="step-number"/g, 'style="background: var(--blue); color: white; width: 24px; height: 24px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; flex-shrink: 0;"');
template = template.replace(/class="checklist"/g, 'style="margin: 12px 0; padding-left: 24px; line-height: 1.6;"');
template = template.replace(/class="tip"/g, 'style="background: var(--green-soft); color: var(--green); padding: 16px; border-radius: 8px; margin: 16px 0;"');
template = template.replace(/class="warning"/g, 'style="background: var(--red-soft); color: var(--red); padding: 16px; border-radius: 8px; margin: 16px 0;"');
template = template.replace(/class="visual-demo"/g, 'style="background: var(--bg-soft); border: 1px solid var(--border); border-radius: 8px; padding: 24px; text-align: center; margin: 16px 0;"');

fs.writeFileSync('src/site/pages/course.njk', template);
console.log('course.njk created.');
