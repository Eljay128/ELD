/**
 * Equine lameness knowledge base.
 *
 * This is reference material handed to the model as part of the system prompt so
 * that its differential is anchored to how equine practitioners actually reason:
 * localise the limb from gait asymmetry, then rank causes by what is *common* in
 * that region for that signalment, not by what is exotic.
 *
 * Sources are listed in README.md. Prevalence tiers are qualitative and reflect
 * the general practice literature; they are deliberately coarse because true
 * incidence varies enormously by discipline, age and geography.
 */

export const AAEP_SCALE = [
  { grade: 0, definition: 'Lameness not perceptible under any circumstances.' },
  {
    grade: 1,
    definition:
      'Difficult to observe; not consistently apparent regardless of circumstances (under saddle, circling, inclines, hard surface).',
  },
  {
    grade: 2,
    definition:
      'Difficult to observe at a walk or trotting in a straight line, but consistently apparent under certain circumstances (weight-carrying, circling, inclines, hard surface).',
  },
  { grade: 3, definition: 'Consistently observable at a trot under all circumstances.' },
  {
    grade: 4,
    definition:
      'Obvious lameness: marked head bob, hip hike or shortened stride. Trot is reluctant, choppy, clearly abnormal. Bears weight at rest but moves with apparent pain.',
  },
  {
    grade: 5,
    definition:
      'Non-weight-bearing, or minimal weight bearing at rest and/or in motion. Cannot use the limb for locomotion.',
  },
];

/**
 * How to read which limb is affected from footage. These rules are the backbone
 * of any visual lameness exam and the model must apply them explicitly.
 */
export const LATERALITY_RULES = `
FORELIMB — the head nod ("down on sound"):
  The head and neck RISE as the LAME forelimb strikes the ground and FALL as the
  SOUND forelimb strikes. The horse offloads the painful limb by lifting the
  forehand over it. So: the limb on the ground when the head is DOWN is the SOUND
  limb; the limb on the ground when the head is UP is the LAME limb.
  Withers vertical movement asymmetry corroborates this.

HINDLIMB — pelvic asymmetry ("hip hike" / sacral rise):
  Asymmetric vertical motion of the tubera sacrale and tubera coxae is the most
  consistent and observable sign. The tuber coxae on the LAME side travels through
  a greater range — rising higher during that limb's stance/push-off and dropping
  lower when the sound limb bears weight. Reduced pelvic fall on the lame side
  during impact ("hip dip" reduction) and a shortened cranial phase of stride are
  supporting signs.

BILATERAL DISEASE HIDES ITSELF:
  Symmetric bilateral pain (classically bilateral navicular, bilateral hock OA,
  laminitis in both fores) may produce NO head nod or hip hike at all. Instead look
  for: short choppy pottery stride, reduced overtrack, unwillingness to extend,
  toe-first landing, "walking on eggshells", stiffness that eases with warm-up
  (arthritic) or worsens with work (soft tissue / laminitic).

COMPENSATORY PATTERNS — a common trap:
  A primary HINDLIMB lameness frequently induces a false head nod that mimics an
  IPSILATERAL forelimb lameness. A primary FORELIMB lameness can induce apparent
  contralateral hindlimb asymmetry. When both a head nod and pelvic asymmetry are
  present, say so and flag which is more likely primary rather than reporting two
  independent lamenesses.

CIRCLES AND SURFACES:
  Lameness of the INSIDE limb usually worsens on a circle toward that side. Foot
  and joint pain typically worsens on hard ground; soft-tissue (suspensory,
  tendon) pain often worsens on soft/deep footing and on the outside limb of a
  circle. Visual assessment reliably detects asymmetry only above roughly 25% —
  subtle grade 1 lameness may be genuinely invisible on video.
`.trim();

/**
 * Condition library. `prevalence` drives ranking: "very common" conditions should
 * out-rank "uncommon" ones unless the footage gives a specific reason not to.
 */
export const CONDITIONS = [
  // ---------------------------------------------------------------- FRONT FOOT
  {
    name: 'Subsolar / hoof abscess',
    region: 'Front or hind foot',
    prevalence: 'very common',
    signalment: 'Any age or type; more frequent in wet-then-dry conditions and after hoof trauma.',
    gaitSigns:
      'Sudden-onset, often severe (AAEP 3-5) unilateral lameness with no prior warning. Marked head nod. Horse may point or non-weight-bear. Frequently mistaken for a fracture because of severity.',
    corroborating:
      'Increased digital pulse in the affected limb, heat in the hoof, pain on hoof testers over a focal spot, possible coronary band swelling if draining.',
    diagnostics: ['Hoof testers', 'Pare to find the tract', 'Radiographs if it fails to resolve or the horse is severely lame'],
    remedies: {
      immediate: 'Stop work. Confine to a stall or small pen with soft bedding. Cold-hose or poultice.',
      veterinary:
        'Vet or experienced farrier establishes drainage. Poultice (Animalintex / ichthammol) with a hoof wrap changed daily. Tetanus status confirmed. NSAIDs only under veterinary direction — masking pain before drainage delays diagnosis.',
      farriery: 'Once drained, keep the tract clean and dry; consider a hospital plate or treatment plate if the hole is large.',
      rehab: 'Hand-walk once sound, then rebuild over 1-2 weeks. No lasting conditioning loss.',
      timeline: 'Dramatic improvement within 24-48 hours of drainage; sound in 3-10 days.',
      prognosis: 'Excellent.',
    },
  },
  {
    name: 'Navicular syndrome / podotrochlear pain',
    region: 'Front feet (palmar foot)',
    prevalence: 'very common',
    signalment:
      'Peak incidence around 9 years, range 3-18. Quarter Horses, Thoroughbreds and warmbloods over-represented. Upright, small or underrun feet increase risk.',
    gaitSigns:
      'Chronic, intermittent, usually BILATERAL forelimb lameness — often no head nod, just a short, choppy, pottery front-end stride with reduced extension. Toe-first landing. Worse on hard ground and on circles; worse on the inside limb. Stumbling. Often described by owners as "he just doesn\'t track up in front".',
    corroborating: 'Positive to hoof testers over the central frog, worse after distal limb flexion, improves on soft footing.',
    diagnostics: ['Palmar digital nerve block', 'Radiographs of the navicular bone', 'MRI is the definitive test for soft-tissue podotrochlear injury'],
    remedies: {
      immediate: 'Reduce work on hard and uneven ground. Do not keep pushing through it.',
      veterinary:
        'Confirm with blocks and imaging before treating. Options include NSAIDs, intra-articular or navicular-bursa medication, bisphosphonates (tiludronate/clodronate, in horses over 4 years), and shockwave therapy.',
      farriery:
        'The single highest-value intervention. Shorten the toe, restore breakover, support the heels — rolled/rocker toe with a bar or egg-bar shoe, and correct any medio-lateral imbalance. Shoeing cycle every 4-6 weeks, never longer.',
      rehab:
        'Controlled work on good, level, forgiving footing. Straight lines before circles. Build hindquarter engagement so the horse stops loading the forehand.',
      timeline: 'Response to corrective shoeing is usually visible over 2-3 shoeing cycles (8-18 weeks).',
      prognosis:
        'Manageable rather than curable. Many horses return to full work with sustained farriery and workload management; degenerative cases decline over years.',
    },
  },
  {
    name: 'Laminitis',
    region: 'Both front feet (occasionally all four)',
    prevalence: 'common',
    signalment:
      'Strongly associated with equine metabolic syndrome, PPID/Cushing\'s, obesity, grain overload, lush pasture, and supporting-limb overload after severe contralateral injury.',
    gaitSigns:
      'Bilateral forelimb — often no head nod. Classic sawhorse/rocked-back stance with weight shifted onto the heels and hindquarters. Extremely reluctant to turn (pivots stiffly). Short, shuffling, "walking on eggshells" gait, markedly worse on hard ground. Repeated weight-shifting at rest.',
    corroborating: 'Strong bounding digital pulses, heat in the hooves, pain across the toe with hoof testers, cresty neck, prior founder rings.',
    diagnostics: ['Immediate veterinary examination', 'Lateral radiographs to measure rotation/sinking', 'ACTH and insulin testing for underlying endocrine disease'],
    remedies: {
      immediate:
        'EMERGENCY — call a veterinarian today. Remove all grain and pasture access. Confine to deep soft bedding or sand. Do NOT force the horse to walk for assessment. Ice the feet if the onset is acute (within 48h).',
      veterinary:
        'Analgesia, treat the underlying cause (endocrine testing is essential, not optional), mechanical support of the coffin bone.',
      farriery:
        'Frog and sole support (styrofoam pads, clogs, heart-bar shoes) fitted in consultation with the vet and radiographs. Toe shortened to reduce leverage on the laminae.',
      rehab: 'Strictly stall rest until radiographs are stable, then very gradual return. Long-term diet and weight management is the actual cure.',
      timeline: 'Weeks to many months; endocrine management is lifelong.',
      prognosis: 'Guarded and entirely dependent on degree of rotation/sinking and control of the underlying metabolic disease.',
    },
  },
  {
    name: 'Bruised sole / corn',
    region: 'Foot',
    prevalence: 'common',
    signalment: 'Thin-soled and flat-footed horses; after work on stony ground or a poor trim.',
    gaitSigns: 'Mild to moderate lameness (AAEP 2-3), noticeably worse on hard or stony footing and better on soft going.',
    corroborating: 'Diffuse hoof-tester pain, sometimes visible red discolouration in the sole at the next trim.',
    diagnostics: ['Hoof testers', 'Radiographs if it fails to resolve, to rule out pedal osteitis or a fracture'],
    remedies: {
      immediate: 'Rest on soft footing, cold-hose.',
      veterinary: 'NSAIDs short-term if the vet agrees.',
      farriery: 'Pads or a wider-web shoe; address the thin sole and any medio-lateral imbalance.',
      rehab: 'Return to work as soundness allows, avoiding stony ground.',
      timeline: '5-14 days.',
      prognosis: 'Very good, but recurrent if the underlying foot conformation and trim are not addressed.',
    },
  },

  // -------------------------------------------------------- DISTAL LIMB / TENDON
  {
    name: 'Superficial digital flexor tendonitis ("bowed tendon")',
    region: 'Palmar/plantar cannon, usually forelimb',
    prevalence: 'common',
    signalment: 'Racing, eventing, jumping; fatigue and deep or uneven footing are major risk factors.',
    gaitSigns:
      'Acute onset lameness, variable severity, often shortened cranial phase of stride. May be markedly worse on soft/deep footing. Some chronic cases trot near-sound but show a persistent convex "bow" behind the cannon.',
    corroborating: 'Heat, swelling and pain on palpation of the tendon; visible bowed contour viewed from the side.',
    diagnostics: ['Ultrasound (the definitive test — quantifies lesion cross-sectional area)', 'Serial ultrasound to guide return to work'],
    remedies: {
      immediate: 'Stop work immediately. Cold therapy and a support bandage. Box rest pending ultrasound.',
      veterinary:
        'Ultrasound-guided staging. Options include controlled rehabilitation (the mainstay), regenerative therapy (PRP, stem cells) and shockwave. Reinjury risk is what kills careers, so the rehab plan matters more than the injection.',
      farriery: 'Balanced trim; avoid long toe / low heel which increases tendon strain.',
      rehab:
        'Months-long, ultrasound-checked, progressive: box rest with hand-walking, then increasing walk, then trot, then canter, then turnout. Do not shortcut this — the tendon remodels slowly.',
      timeline: '6-12 months to full work.',
      prognosis: 'Fair to good for return to work; reinjury rate is significant, particularly in racehorses.',
    },
  },
  {
    name: 'Proximal suspensory desmitis',
    region: 'Upper cannon, fore or hind',
    prevalence: 'common',
    signalment: 'Sport horses, dressage horses; hindlimb form is common in horses with straight hocks or dropped fetlocks.',
    gaitSigns:
      'Often insidious rather than acute. Hindlimb form: poor hindquarter engagement, reduced push-off, shortened cranial stride phase, "not going forward". Frequently WORSE on soft/deep footing and on the OUTSIDE limb of a circle — the opposite of foot pain. May be bilateral and therefore show as loss of performance rather than obvious lameness.',
    corroborating: 'Pain on deep palpation just below the hock/carpus; worse after proximal limb flexion.',
    diagnostics: ['Regional nerve blocks', 'Ultrasound', 'MRI or scintigraphy for hindlimb cases where ultrasound is equivocal'],
    remedies: {
      immediate: 'Reduce workload; avoid deep footing.',
      veterinary:
        'Shockwave therapy, regenerative injections, and in refractory hindlimb cases neurectomy/fasciotomy of the deep branch of the lateral plantar nerve.',
      farriery: 'Support the heels and shorten breakover; correct any dropped-fetlock/long-toe conformation contribution.',
      rehab:
        'Straight-line controlled exercise on firm, even footing, avoiding circles early. Core and hindquarter strengthening (pole work, hill work) once cleared.',
      timeline: '3-9 months; hindlimb cases are slower than forelimb.',
      prognosis: 'Good in the forelimb, more guarded in the hindlimb.',
    },
  },
  {
    name: 'Fetlock joint synovitis / osteoarthritis',
    region: 'Fetlock, fore or hind',
    prevalence: 'common',
    signalment: 'Older performance horses; high-speed and high-impact disciplines.',
    gaitSigns: 'Shortened stride, reduced fetlock extension, lameness worse after work and on hard ground; positive to fetlock flexion.',
    corroborating: 'Joint effusion, thickened joint capsule, reduced range of motion on manipulation.',
    diagnostics: ['Intra-articular block', 'Radiographs', 'Ultrasound for the collateral and sesamoidean ligaments'],
    remedies: {
      immediate: 'Reduce concussive work; cold therapy after exercise.',
      veterinary: 'Intra-articular corticosteroid/hyaluronan, systemic polysulphated glycosaminoglycans, NSAIDs as directed.',
      farriery: 'Ease breakover; keep the foot balanced to reduce torque on the joint.',
      rehab: 'Consistent low-impact work beats stop-start. Warm up long, work on good footing.',
      timeline: 'Ongoing management; improvement within 1-3 weeks of joint medication.',
      prognosis: 'Good with management for mild cases; degenerative change is permanent.',
    },
  },

  // ------------------------------------------------------------ UPPER FORELIMB
  {
    name: 'Ringbone (pastern or coffin joint osteoarthritis)',
    region: 'Pastern / coffin joint',
    prevalence: 'common',
    signalment: 'Middle-aged and older horses; conformational imbalance and repeated concussion.',
    gaitSigns: 'Chronic, progressive, worse on hard ground and circles. Shortened stride; may show a distinct head nod once moderate.',
    corroborating: 'Palpable firm bony enlargement around the pastern (high ringbone); reduced pastern flexion.',
    diagnostics: ['Radiographs', 'Regional/intra-articular blocks'],
    remedies: {
      immediate: 'Move work onto softer, even footing.',
      veterinary: 'NSAIDs, joint medication; surgical arthrodesis for advanced pastern-joint cases.',
      farriery: 'Balanced trim with eased breakover in all directions to reduce joint torque — a very high-value intervention here.',
      rehab: 'Regular light exercise to preserve range of motion; avoid deep and uneven ground.',
      timeline: 'Management is lifelong; comfort usually improves within weeks of shoeing changes and medication.',
      prognosis: 'Fair; many horses stay in light-to-moderate work for years.',
    },
  },
  {
    name: 'Carpal (knee) osteoarthritis or chip fracture',
    region: 'Carpus',
    prevalence: 'moderately common',
    signalment: 'Racehorses and jumpers particularly.',
    gaitSigns: 'Shortened cranial phase, reduced carpal flexion, may swing the limb outward to avoid flexing. Worse after carpal flexion.',
    corroborating: 'Carpal effusion, pain on flexion, reduced flexion angle.',
    diagnostics: ['Radiographs including flexed and skyline views', 'Intra-articular block'],
    remedies: {
      immediate: 'Rest from fast work.',
      veterinary: 'Arthroscopic removal of chips where present; joint medication for OA.',
      farriery: 'Balanced trim to reduce abnormal loading.',
      rehab: 'Graduated return after surgery, typically 3-6 months.',
      timeline: 'Post-arthroscopy return to work commonly 3-6 months.',
      prognosis: 'Good after chip removal if articular cartilage is intact.',
    },
  },
  {
    name: 'Shoulder / upper limb pain (bicipital bursitis, OA, muscle injury)',
    region: 'Shoulder',
    prevalence: 'uncommon',
    signalment: 'Trauma, collisions, falls; occasionally OCD in young horses.',
    gaitSigns:
      'Markedly shortened CRANIAL phase of stride — the limb does not reach forward — with a low arc of foot flight and possible circumduction. Worse going downhill. Muscle atrophy over the shoulder in chronic cases.',
    corroborating: 'Pain on shoulder extension/flexion, localised atrophy.',
    diagnostics: ['Ultrasound', 'Radiographs', 'Scintigraphy — proximal limb lameness is genuinely difficult to localise'],
    remedies: {
      immediate: 'Rest.',
      veterinary: 'Bursa medication, systemic anti-inflammatories, treat the specific structure once identified.',
      farriery: 'Minimal role.',
      rehab: 'Long-slow-distance straight-line work; physiotherapy and controlled stretching.',
      timeline: '2-6 months.',
      prognosis: 'Variable; depends heavily on the structure involved.',
    },
  },

  // ------------------------------------------------------------------ HINDLIMB
  {
    name: 'Distal hock osteoarthritis (bone spavin)',
    region: 'Distal tarsal joints',
    prevalence: 'very common',
    signalment:
      'Middle-aged sport horses of every discipline; over-represented in dressage, western performance and jumping. Sickle- or cow-hocked conformation increases risk.',
    gaitSigns:
      'Frequently BILATERAL, so often no clear hip hike — instead a short, stabby hind stride, poor engagement, reduced overtrack, dragging or scuffing the hind toes, difficulty with canter leads and lateral work, "cold-backed" and stiff at the start of work that eases with warm-up. Worse on circles.',
    corroborating: 'Strongly positive to full-limb (spavin) flexion, worse on a small circle on hard ground, toe wear on the hind shoes.',
    diagnostics: ['Spavin flexion test', 'Intra-articular blocks of the tarsometatarsal and distal intertarsal joints', 'Radiographs'],
    remedies: {
      immediate: 'Keep the horse moving — box rest makes spavin worse, not better.',
      veterinary:
        'Intra-articular corticosteroids into the distal hock joints (the mainstay), systemic NSAIDs, bisphosphonates in selected cases; chemical or surgical arthrodesis for advanced cases, which can leave the horse very comfortable once fused.',
      farriery: 'Ease breakover, slight lateral extension or a rolled toe on hind shoes to reduce twisting at the hock. Keep the shoeing cycle tight.',
      rehab:
        'Long warm-up, straight-line and hill work to build hindquarter strength, pole work for engagement. Consistent daily turnout. Avoid repetitive small circles until comfortable.',
      timeline: 'Improvement within 1-2 weeks of joint injection; conditioning gains over 2-3 months.',
      prognosis: 'Good — this is one of the most successfully managed causes of poor hind-end performance.',
    },
  },
  {
    name: 'Stifle pain (medial femorotibial pain, meniscal injury, or OCD)',
    region: 'Stifle',
    prevalence: 'common',
    signalment: 'Young horses for OCD; performance horses of any age for soft-tissue injury; straight-stifled conformation.',
    gaitSigns:
      'Shortened cranial phase behind, reluctance to push off, difficulty with downhill work and tight turns, dragging the hind toe. May show a pronounced hip hike. Horse often struggles to canter or repeatedly takes the wrong lead.',
    corroborating: 'Stifle effusion, positive to upper-limb flexion, pain on direct pressure.',
    diagnostics: ['Radiographs', 'Ultrasound', 'Arthroscopy for definitive meniscal/cartilage assessment'],
    remedies: {
      immediate: 'Stop jumping and hill work.',
      veterinary: 'Intra-articular medication, regenerative therapy, arthroscopic surgery for OCD lesions or meniscal tears.',
      farriery: 'Balanced trim; avoid excessive heel elevation.',
      rehab:
        'Strengthening is central — straight-line hill work, pole work, backing up, and controlled hand-walking build the quadriceps and stabilise the joint.',
      timeline: '3-9 months depending on the lesion.',
      prognosis: 'Good for OCD after surgery in young horses; more guarded for meniscal tears.',
    },
  },
  {
    name: 'Upward fixation of the patella / delayed patellar release',
    region: 'Stifle',
    prevalence: 'moderately common',
    signalment: 'Young, unfit, straight-hocked horses; horses returning from a layup; ponies.',
    gaitSigns:
      'Very distinctive: the hindlimb momentarily LOCKS in extension and is dragged, then releases with a snap or jerk. Milder cases show a delayed, jerky release of the stifle at the start of stride, worst at walk, at the start of work, and going downhill; often improves as the horse warms up.',
    corroborating: 'Audible or palpable click; the limb can sometimes be manually unlocked.',
    diagnostics: ['Clinical observation — the pattern is usually diagnostic', 'Radiographs to exclude concurrent joint disease'],
    remedies: {
      immediate: 'Avoid box rest, which worsens it. Increase controlled turnout.',
      veterinary:
        'Conditioning first. If it persists: counter-irritant injection of the medial patellar ligament, or medial patellar desmoplasty/desmotomy as a last resort.',
      farriery: 'Slightly raise the heel and ease breakover.',
      rehab:
        'THE primary treatment is quadriceps strengthening: hill work, backing up, cavaletti and pole work, long straight-line trotting. Many young horses simply outgrow it once fit.',
      timeline: '4-12 weeks of consistent conditioning.',
      prognosis: 'Very good, especially in young horses that are simply unfit.',
    },
  },
  {
    name: 'Sacroiliac dysfunction',
    region: 'Pelvis / sacroiliac',
    prevalence: 'moderately common',
    signalment: 'Tall, long-backed sport horses; dressage and jumping; often secondary to a chronic hindlimb lameness.',
    gaitSigns:
      'Poor hindquarter engagement and loss of power rather than obvious limping. Asymmetric pelvic movement, bunny-hopping in canter, disunited canter, refusal to work through the back, resistance to lateral work. Asymmetry of the tubera sacrale ("hunter\'s bump") in chronic cases.',
    corroborating: 'Pain on pressure over the tubera sacrale and coxae; asymmetry of the gluteal musculature.',
    diagnostics: ['Ultrasound', 'Scintigraphy', 'Diagnostic injection of the sacroiliac region'],
    remedies: {
      immediate: 'Rule out a primary hindlimb lameness first — SI pain is frequently secondary.',
      veterinary: 'Corticosteroid injection of the SI region, shockwave, mesotherapy.',
      farriery: 'Indirect; correct any hind imbalance driving compensation.',
      rehab:
        'Core and topline rehabilitation is the treatment: baited stretches, pelvic lifts, pole and hill work, long-and-low straight-line work. Physiotherapy is genuinely valuable here.',
      timeline: '3-6 months of consistent rehab work.',
      prognosis: 'Fair to good if the primary driver is found and addressed.',
    },
  },
  {
    name: 'Curb / plantar ligament desmitis',
    region: 'Plantar hock',
    prevalence: 'moderately common',
    signalment: 'Sickle-hocked horses; jumping and racing.',
    gaitSigns: 'Mild hindlimb lameness, sometimes only visible when fresh; visible convex swelling on the plantar aspect of the hock viewed from the side.',
    corroborating: 'Heat, swelling and pain on palpation of the plantar hock.',
    diagnostics: ['Ultrasound'],
    remedies: {
      immediate: 'Cold therapy, reduce work.',
      veterinary: 'Anti-inflammatories, shockwave.',
      farriery: 'Correct sickle-hock loading where possible.',
      rehab: 'Controlled exercise; return as ultrasound allows.',
      timeline: '6-12 weeks.',
      prognosis: 'Good; the cosmetic blemish often persists after soundness returns.',
    },
  },

  // ------------------------------------------------------------ NON-ORTHOPAEDIC
  {
    name: 'Neurologic gait deficit (e.g. cervical vertebral stenotic myelopathy, EPM)',
    region: 'Neurologic — not a true lameness',
    prevalence: 'uncommon but critical not to miss',
    signalment: 'Young rapidly-growing horses (CVSM); any horse in EPM-endemic areas.',
    gaitSigns:
      'Ataxia rather than lameness: swaying, limb crossing or interference, toe dragging, circumduction of the hind limbs, a wide-based stance, stumbling, and difficulty with tight turns and backing. Signs are typically WORSE on turns, slopes and when the head is elevated, and do not follow a clean single-limb lameness pattern. Asymmetric muscle atrophy suggests EPM.',
    corroborating: 'Poor proprioceptive placement, abnormal tail pull, delayed limb replacement after crossing.',
    diagnostics: ['Full neurologic examination by a veterinarian', 'Cervical radiographs / myelogram', 'CSF analysis and serology for EPM'],
    remedies: {
      immediate:
        'Do not ride. An ataxic horse is a safety risk to its rider and itself. Arrange veterinary neurologic assessment.',
      veterinary: 'Diagnosis-specific: anti-protozoal therapy for EPM; anti-inflammatories and, in selected cases, surgical stabilisation for CVSM.',
      farriery: 'Minimal role.',
      rehab: 'Only under veterinary direction once a diagnosis is established.',
      timeline: 'Weeks to months; some deficits are permanent.',
      prognosis: 'Variable and often guarded.',
    },
  },
  {
    name: 'Poor hoof balance / long-toe low-heel conformation',
    region: 'Foot — a driver of many other conditions',
    prevalence: 'very common',
    signalment: 'Any horse on an over-long shoeing cycle.',
    gaitSigns:
      'Not itself a lameness diagnosis but a frequent visible finding on video: broken-back hoof-pastern axis, underrun heels, long toe, delayed breakover, toe-first or lateral-first landing, uneven foot flight arc. Drives navicular pain, suspensory strain and tendonitis.',
    corroborating: 'Flares, dish, uneven heel height, shoes visibly set back or sprung.',
    diagnostics: ['Farrier assessment', 'Lateral and dorsopalmar foot radiographs to measure palmar angle and medio-lateral balance'],
    remedies: {
      immediate: 'Book the farrier.',
      veterinary: 'Radiographic hoof mapping is worth doing once, to guide the trim precisely.',
      farriery:
        'Restore the hoof-pastern axis: back the toe up, support the heels, correct medio-lateral imbalance. Shorten the cycle to 4-6 weeks.',
      rehab: 'Nothing specific — correct the feet and much else improves on its own.',
      timeline: '2-4 shoeing cycles to substantially remodel.',
      prognosis: 'Excellent; this is the cheapest and highest-yield change most owners can make.',
    },
  },
  {
    name: 'Muscle soreness / overtraining / myopathy',
    region: 'Musculature, often hindquarters and back',
    prevalence: 'common',
    signalment: 'Horses in hard work, after a sudden increase in workload, or with PSSM/RER predisposition.',
    gaitSigns:
      'Stiff, short, symmetric gait; reluctance to go forward; shortened stride behind; may improve with warm-up (or in the case of tying-up, worsen dramatically). Not lame in a single limb.',
    corroborating: 'Firm painful muscles on palpation, sweating, reluctance to move after work.',
    diagnostics: ['Serum CK and AST', 'Genetic testing for PSSM1', 'Muscle biopsy in refractory cases'],
    remedies: {
      immediate: 'Stop work. In an acute tying-up episode do NOT walk the horse back — call the vet.',
      veterinary: 'Bloodwork; fluids and analgesia in acute cases; dietary reformulation for PSSM/RER.',
      farriery: 'Not applicable.',
      rehab: 'Consistent daily exercise with no days off, gradual workload increases, and turnout.',
      timeline: 'Days for simple soreness; lifelong management for PSSM.',
      prognosis: 'Good with correct diet and a consistent exercise routine.',
    },
  },
];

/** Findings that mean "stop the app, call a vet now". */
export const RED_FLAGS = [
  'Non-weight-bearing or barely weight-bearing on any limb (AAEP grade 5) — possible fracture, septic joint or severe abscess.',
  'Sudden severe lameness after a fall, kick or fast work.',
  'Rocked-back sawhorse stance, bounding digital pulses, or extreme reluctance to turn — suspect laminitis.',
  'Visible open wound near or over a joint or tendon sheath — a septic synovial structure is a surgical emergency.',
  'Ataxia, limb crossing, stumbling or knuckling — a neurologic horse is unsafe to ride.',
  'Rapidly worsening lameness, or lameness with fever, sweating or colic-like signs.',
  'Marked swelling with heat and severe pain over a tendon or joint.',
];

/** Assembled reference block injected into the system prompt. */
export function buildKnowledgePrompt() {
  const scale = AAEP_SCALE.map((s) => `  Grade ${s.grade}: ${s.definition}`).join('\n');

  const conditions = CONDITIONS.map((c) => {
    const r = c.remedies;
    return [
      `### ${c.name}`,
      `Region: ${c.region}`,
      `Prevalence: ${c.prevalence}`,
      `Typical signalment: ${c.signalment}`,
      `Gait signs visible on video: ${c.gaitSigns}`,
      c.corroborating ? `Corroborating findings (usually NOT visible on video — must be checked in person): ${c.corroborating}` : '',
      `Confirmatory diagnostics: ${c.diagnostics.join('; ')}`,
      `Remedies — immediate: ${r.immediate}`,
      `Remedies — veterinary: ${r.veterinary}`,
      `Remedies — farriery: ${r.farriery}`,
      `Remedies — rehabilitation/conditioning: ${r.rehab}`,
      `Expected timeline: ${r.timeline}`,
      `Prognosis: ${r.prognosis}`,
    ]
      .filter(Boolean)
      .join('\n');
  }).join('\n\n');

  return `
## AAEP LAMENESS GRADING SCALE (0-5)
${scale}

## READING LATERALITY FROM FOOTAGE
${LATERALITY_RULES}

## RED FLAGS REQUIRING IMMEDIATE VETERINARY ATTENTION
${RED_FLAGS.map((f) => `- ${f}`).join('\n')}

## CONDITION REFERENCE LIBRARY
${conditions}
`.trim();
}
