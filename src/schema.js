/**
 * JSON Schema for the structured differential returned to the browser.
 *
 * Structured outputs require `additionalProperties: false` and an explicit
 * `required` list on every object, and do not support numeric or string
 * constraints (minimum/maxLength/etc.) — those are validated in the UI instead.
 */
export const REPORT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'emergency',
    'viewsAnalyzed',
    'videoQuality',
    'gaitAssessment',
    'differential',
    'strideOptimizationPlan',
    'vetVisitChecklist',
    'limitations',
  ],
  properties: {
    viewsAnalyzed: {
      type: 'array',
      description:
        'One entry per camera view supplied, stating what that view did and did not contribute. ' +
        'Name any of the three standard views (front, rear, side) that were NOT supplied and what was lost as a result.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['view', 'usable', 'contributed'],
        properties: {
          view: {
            type: 'string',
            enum: ['front', 'rear', 'side', 'not supplied'],
          },
          usable: {
            type: 'boolean',
            description: 'Whether this view was of good enough quality to contribute findings.',
          },
          contributed: {
            type: 'string',
            description:
              'What this view established, or — for a missing view — what could not be assessed without it.',
          },
        },
      },
    },

    emergency: {
      type: 'object',
      additionalProperties: false,
      required: ['isEmergency', 'reasons'],
      properties: {
        isEmergency: {
          type: 'boolean',
          description: 'True if anything in the footage or intake matches a red flag needing same-day veterinary attention.',
        },
        reasons: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific red flags observed. Empty when isEmergency is false.',
        },
      },
    },

    videoQuality: {
      type: 'object',
      additionalProperties: false,
      required: ['rating', 'issues', 'suggestions'],
      properties: {
        rating: {
          type: 'string',
          enum: ['good', 'fair', 'poor', 'unusable'],
          description: 'How well this footage supports a gait assessment.',
        },
        issues: {
          type: 'array',
          items: { type: 'string' },
          description: 'What limits the assessment (angle, distance, surface, gait shown, motion blur, obstruction).',
        },
        suggestions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Concrete instructions for reshooting a more diagnostic clip.',
        },
      },
    },

    gaitAssessment: {
      type: 'object',
      additionalProperties: false,
      required: [
        'gaitsObserved',
        'aaepGrade',
        'aaepGradeRationale',
        'affectedLimbs',
        'keyObservations',
        'compensatoryPattern',
      ],
      properties: {
        gaitsObserved: {
          type: 'array',
          items: { type: 'string' },
          description: 'Gaits actually visible in the footage, e.g. walk, trot, canter.',
        },
        aaepGrade: {
          type: 'string',
          enum: ['0', '1', '2', '3', '4', '5', 'indeterminate'],
          description: 'Estimated AAEP lameness grade, or "indeterminate" if the footage cannot support a grade.',
        },
        aaepGradeRationale: {
          type: 'string',
          description: 'One or two sentences justifying the grade against the AAEP definitions.',
        },
        affectedLimbs: {
          type: 'array',
          description: 'Limbs implicated, most confident first. Empty if no asymmetry is detectable.',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['limb', 'confidence', 'evidence'],
            properties: {
              limb: {
                type: 'string',
                enum: [
                  'left fore',
                  'right fore',
                  'left hind',
                  'right hind',
                  'both fore',
                  'both hind',
                  'multiple limbs',
                  'undetermined',
                ],
              },
              confidence: { type: 'string', enum: ['high', 'moderate', 'low'] },
              evidence: {
                type: 'string',
                description:
                  'The specific visual evidence, citing frame timestamps and the laterality rule applied (head nod direction, hip hike side, stride length).',
              },
            },
          },
        },
        keyObservations: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Objective observations from the frames: head/neck excursion, pelvic symmetry, stride length and overtrack, foot flight arc, landing pattern, hoof-pastern axis, muscle symmetry, posture.',
        },
        compensatoryPattern: {
          type: 'string',
          description:
            'Assessment of whether any secondary asymmetry is likely compensatory rather than a second primary lameness. Say "none apparent" if not applicable.',
        },
      },
    },

    differential: {
      type: 'array',
      description: 'Candidate diagnoses ordered from most to least likely.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'rank',
          'condition',
          'region',
          'likelihood',
          'likelihoodRating',
          'rationale',
          'supportingEvidence',
          'againstEvidence',
          'confirmatoryTests',
          'remedies',
        ],
        properties: {
          rank: { type: 'integer', description: '1 is the most likely.' },
          condition: { type: 'string' },
          region: { type: 'string', description: 'Anatomic region, e.g. "left front foot".' },
          likelihood: {
            type: 'string',
            enum: ['most likely', 'likely', 'possible', 'less likely', 'unlikely but important to exclude'],
          },
          likelihoodRating: {
            type: 'integer',
            description: 'Rough confidence 0-100 that this is the primary problem. All entries need not sum to 100.',
          },
          rationale: { type: 'string', description: 'Two or three sentences on why this sits where it does in the ranking.' },
          supportingEvidence: {
            type: 'array',
            items: { type: 'string' },
            description: 'What in the footage, signalment or history points toward this condition.',
          },
          againstEvidence: {
            type: 'array',
            items: { type: 'string' },
            description: 'What argues against it, or what could not be assessed from video.',
          },
          confirmatoryTests: {
            type: 'array',
            items: { type: 'string' },
            description: 'The in-person tests or imaging a vet would use to confirm or exclude this.',
          },
          remedies: {
            type: 'object',
            additionalProperties: false,
            required: [
              'immediate',
              'veterinary',
              'farriery',
              'rehabAndConditioning',
              'expectedTimeline',
              'prognosis',
            ],
            properties: {
              immediate: { type: 'string', description: 'What the owner should do today, before the vet arrives.' },
              veterinary: { type: 'string', description: 'Treatments a vet would consider. Framed as options to discuss, not prescriptions.' },
              farriery: { type: 'string', description: 'Trimming and shoeing changes that help this condition.' },
              rehabAndConditioning: {
                type: 'array',
                items: { type: 'string' },
                description: 'Concrete exercises and workload progression to rebuild the horse toward full stride.',
              },
              expectedTimeline: { type: 'string' },
              prognosis: { type: 'string' },
            },
          },
        },
      },
    },

    strideOptimizationPlan: {
      type: 'object',
      additionalProperties: false,
      required: ['goal', 'phases', 'farrierPriorities', 'monitoring'],
      description:
        'A conditioning plan to restore full, free forward stride once the veterinary diagnosis is confirmed and the vet has cleared the horse to work.',
      properties: {
        goal: { type: 'string' },
        phases: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'duration', 'focus', 'sessions', 'progressionCriteria'],
            properties: {
              name: { type: 'string' },
              duration: { type: 'string', description: 'e.g. "weeks 1-3".' },
              focus: { type: 'string' },
              sessions: { type: 'array', items: { type: 'string' }, description: 'Specific work to do in this phase.' },
              progressionCriteria: { type: 'string', description: 'What must be true before moving to the next phase.' },
            },
          },
        },
        farrierPriorities: { type: 'array', items: { type: 'string' } },
        monitoring: {
          type: 'array',
          items: { type: 'string' },
          description: 'What to re-check, how often, and the signs that mean stop and call the vet.',
        },
      },
    },

    vetVisitChecklist: {
      type: 'array',
      items: { type: 'string' },
      description: 'Questions and information to bring to the veterinary appointment so it is efficient.',
    },

    limitations: {
      type: 'array',
      items: { type: 'string' },
      description: 'Honest statement of what this video-only assessment cannot determine.',
    },
  },
};
