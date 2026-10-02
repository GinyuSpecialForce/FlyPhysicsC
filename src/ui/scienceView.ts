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
          <tr><td><b>Optic lobe</b><br><span class="muted">lamina → medulla → lobula</span></td><td class="muted">motion &amp; form vision</td><td>tokenizes quantities + units ("5 kg", "30°") and physics keywords</td></tr>
          <tr><td><b>Mushroom bodies</b><br><span class="muted">Kenyon cells</span></td><td class="muted">olfactory learning, sparse codes</td><td>a 24-hidden-unit network classifies the problem into 12 topic families</td></tr>
          <tr><td><b>Central complex</b><br><span class="muted">fan-shaped body</span></td><td class="muted">action selection, navigation</td><td>routes to the right solver circuit, blending innate priors with learned classification</td></tr>
          <tr><td><b>Ventral nerve cord + legs</b></td><td class="muted">motor programs</td><td>12 symbolic circuits bind quantities to standard equations and compute</td></tr>
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
    <div class="panel"><div class="panel-head"><span>Limitations</span></div>
      <ul class="muted limit-list">
        <li>Multiple choice only, 5 options — the circuits match a computed value against choices; no free-response (yet).</li>
        <li>The "learning" is classification, not reasoning; the algebra is deliberately symbolic.</li>
        <li>Some circuits assume typical values when a problem omits one (e.g. μ = 0.2), noted in the solution traces.</li>
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
