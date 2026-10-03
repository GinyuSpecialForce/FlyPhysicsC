/**
 * The Science page — what's real, what's homage, what's limited. Escaped,
 * static content; the numbers here (12 circuits, 60-problem bank) are the
 * single documented copy, so they can't drift from the code again.
 */
import { byId } from "./dom";

export function renderScience(): void {
  byId("scienceContent").innerHTML = `
    <h1>The science</h1>
    <p class="muted">What you're watching, honestly described.</p>
    <div class="panel"><div class="panel-head"><span>The honest version</span></div>
      <p class="muted">A fly does not do physics. This is a <b>neuromorphic homage</b>: a small neural network
      shaped by real fly neuroanatomy does the pattern-recognition part of problem solving, and
      hand-built symbolic "motor circuits" do the algebra — the same division of labor our own
      calculators have. Nothing here claims a fruit fly could pass AP Physics C.</p>
    </div>
    <div class="panel"><div class="panel-head"><span>Region → pipeline map</span></div>
      <table class="region-map">
        <thead><tr><th>Fly region</th><th>Real role</th><th>Here</th></tr></thead>
        <tbody>
          <tr><td><b>Optic lobe</b><br><span class="muted">lamina → medulla → lobula</span></td><td class="muted">motion &amp; form vision</td><td>tokenizes quantities + units ("5 kg", "30°") and physics keywords — including from a photographed page, after OCR and math normalization</td></tr>
          <tr><td><b>Mushroom bodies</b><br><span class="muted">Kenyon cells</span></td><td class="muted">olfactory learning, sparse codes</td><td>a 24-hidden-unit network classifies the problem into 12 topic families</td></tr>
          <tr><td><b>Central complex</b><br><span class="muted">fan-shaped body</span></td><td class="muted">action selection, navigation</td><td>routes to the right solver circuit, blending innate priors with learned classification</td></tr>
          <tr><td><b>Ventral nerve cord + legs</b></td><td class="muted">motor programs</td><td>12 symbolic circuits bind quantities to standard equations and compute, citing the equation sheet and the constants they used</td></tr>
        </tbody>
      </table>
    </div>
    <div class="panel"><div class="panel-head"><span>How it learned</span></div>
      <p class="muted">The mushroom bodies train on <b>generated</b> problems (template
      generators with randomized values across all 12 topics), then are graded on
      <b>60 hand-written problems they have never seen</b> — the eval bank. The demo brain you're watching
      scored 100% on that bank; the gate was 85%. The confusion matrix in Training shows every mistake,
      and the Lesion Lab shows what breaks when you cut regions out. Both are computed live in your browser.</p>
    </div>
    <div class="panel"><div class="panel-head"><span>The equation sheet and the constants table</span></div>
      <p class="muted">The <b>Reference</b> tab is not decoration: it is rendered from
      <code>equation-sheet.ts</code> and <code>constant-table.ts</code>, the same data the
      circuits solve with. Every answer names the equation it used and the constants it
      consulted, and when no hand-written circuit can bind a phrasing the fly searches the
      sheet for an equation whose variables all bind and evaluates it — the same division of
      labour as the rest of the app, one level up.</p>
    </div>
    <div class="panel"><div class="panel-head"><span>Reading pictures</span></div>
      <p class="muted">You can paste, drop or pick a screenshot of a problem. The fly reads it
      in your browser with Tesseract, normalizes the text for math (<code>6.75 X 10-8</code>,
      <code>μs</code>, <code>1/2 of the circle</code>), and shows you exactly what it read —
      with a confidence score and the specific numbers it was unsure about — before it
      works. Handwriting is out of scope; printed problems are what it can read.</p>
    </div>
    <div class="panel"><div class="panel-head"><span>Answers in terms of variables</span></div>
      <p class="muted">Ask a question "in terms of <i>m</i> and <i>v</i>" and the fly answers in
      your variables — <code>mv²/r</code> — and, because it knows the numbers too, tells you what
      that comes to for the values you gave. It reads a variable from a cue word ("of mass <i>m</i>")
      or an assignment ("<i>m</i> = 2.0 kg"), and if you name the variables outright it uses
      exactly those. On a multiple-choice question it matches options written any way you like:
      <code>mv²/r</code>, <code>m v^2 / r</code> and <code>m*v^2/r</code> are the same answer,
      and <code>2mv²/r</code> is not.</p>
    </div>
    <div class="panel"><div class="panel-head"><span>Checking the fly's work</span></div>
      <p class="muted">Once the fly has an answer, <b>Show the fly's work</b> opens the whole trace on
      one sheet: the quantities it pulled off the page, how the classifier split its confidence across
      all twelve topics, which circuit actually ran, and every equation, substitution and runner-up it
      considered. It is the same record the pipeline produced, printed — none of it is re-derived, so
      it cannot disagree with what the fly really did. That is where the awkward parts show up: a
      question classified as <code>kinematics</code> that is really <code>circuits</code>, a circuit
      rerouted because it could not bind the phrasing, the equation the rescue chose and the two it
      passed over. Because a question you typed or photographed has no answer key, the sheet never
      claims the fly was right or wrong — it prints what it computed.</p>
    </div>
    <div class="panel"><div class="panel-head"><span>Limitations</span></div>
      <ul class="muted limit-list">
        <li>Multiple choice only, 5 options — the circuits match a computed value against choices; no free-response (yet).</li>
        <li>The "learning" is classification, not reasoning; the algebra is deliberately symbolic.</li>
        <li>Symbolic answers are not general algebra. The fly can only answer in terms of variables for relations the equation sheet already describes, and it needs to be told which variables you mean — it will not rearrange an equation the sheet does not contain, and it will not invent a symbol you did not name.</li>
        <li>Some circuits assume typical values when a problem omits one (e.g. μ = 0.2), noted in the solution traces.</li>
        <li>The equation-sheet solver can pick a dimensionally valid but physically wrong relation on an unfamiliar phrasing. It always shows you the equation it used so you can check, and it declines rather than guess when nothing fits.</li>
        <li>OCR reads printed text, not handwriting, and will occasionally misread a digit — the transcript is always shown for you to correct first.</li>
        <li>Reading a picture needs ~11 MB of OCR assets (<code>npm run ocr:assets</code>); nothing is downloaded unless you paste an image.</li>
        <li>The 3D anatomy is stylized, not to scale; connectome-accurate rendering is future work.</li>
      </ul>
    </div>
    <div class="panel"><div class="panel-head"><span>Real fly neuroscience, if you're curious</span></div>
      <p class="muted">Region names and wiring motifs follow real insect neuroanatomy —
      see <a href="https://virtualflybrain.org" target="_blank" rel="noopener">Virtual Fly Brain</a>
      and the <a href="https://flybase.org" target="_blank" rel="noopener">FlyBase</a> project.
      The mushroom bodies' role in learning and the central complex's role in action selection are two of the
      best-studied circuits in neuroscience.</p>
    </div>`;
}
