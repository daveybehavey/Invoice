/**
 * NoteBill Golden Test Corpus — ~40 adversarial cases (Issue #55).
 * Machine-readable fixtures. Expand toward ~100 using the same shape.
 *
 * Reuses AG-082 / AG-088 / AG-094 scenarios where valid (see relatedAG).
 */
import type { GoldenCase } from "./types.js";

export const GOLDEN_CASES: GoldenCase[] = [
  {
    "id": "GC-001",
    "category": "missing_price",
    "title": "Acid price unknown must not become $0 (AG-082)",
    "messyInput": "Opened pool. Added 1 acid jug but supplier price not written down. Acid wash $200.",
    "expectedFacts": [
      {
        "subject": "acid jug",
        "kind": "material",
        "field": "price",
        "state": "unresolved"
      },
      {
        "subject": "acid jug",
        "kind": "material",
        "field": "quantity",
        "state": "known",
        "value": 1
      },
      {
        "subject": "acid wash",
        "kind": "material",
        "field": "price",
        "state": "known",
        "value": 200
      }
    ],
    "expectedUnresolved": [
      {
        "subject": "acid jug",
        "field": "price",
        "reason": "supplier price not written down"
      }
    ],
    "expectedLineHints": [
      {
        "descriptionMatch": "acid(?!.*wash)",
        "amountMustBeAbsent": true,
        "unitPriceMustBeAbsent": true
      },
      {
        "descriptionMatch": "acid wash",
        "amount": 200
      }
    ],
    "invariants": [
      "unknown_price_not_zero",
      "no_evidence_no_invented_money",
      "unresolved_facts_visible",
      "blockers_prevent_silent_finalization",
      "deterministic_arithmetic_only",
      "later_evidence_field_scoped"
    ],
    "rationale": "Unknown price must stay unresolved; sibling acid wash pricing must not authorize acid=$0.",
    "relatedAG": [
      "AG-082",
      "AG-094"
    ],
    "tags": [
      "founding-beta",
      "materials"
    ],
    "candidates": [
      {
        "label": "invented-zero-acid",
        "lineItems": [
          {
            "description": "Acid jug",
            "quantity": 1,
            "unitPrice": 0,
            "amount": 0
          },
          {
            "description": "Acid wash",
            "quantity": 1,
            "unitPrice": 200,
            "amount": 200
          }
        ],
        "expectViolations": true,
        "expectedViolationIds": [
          "unknown_price_not_zero",
          "blockers_prevent_silent_finalization"
        ],
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "needsFollowUp": false,
        "subtotal": 200
      },
      {
        "label": "safe-unresolved",
        "lineItems": [
          {
            "description": "Acid jug",
            "quantity": 1
          },
          {
            "description": "Acid wash",
            "quantity": 1,
            "unitPrice": 200,
            "amount": 200
          }
        ],
        "expectViolations": false,
        "openDecisions": [
          {
            "prompt": "Confirm unit price for \"Acid jug\"?",
            "kind": "billing",
            "fieldHint": "price",
            "subjectHint": "acid jug"
          }
        ],
        "qualityGateStatus": "needs_review",
        "needsFollowUp": true,
        "subtotal": 200
      }
    ]
  },
  {
    "id": "GC-002",
    "category": "missing_price",
    "title": "Omitted acid restored as unresolved (AG-082)",
    "messyInput": "Pool open. Added acid but price unknown. Brushing included.",
    "expectedFacts": [
      {
        "subject": "acid",
        "kind": "material",
        "field": "price",
        "state": "unresolved"
      }
    ],
    "expectedUnresolved": [
      {
        "subject": "acid",
        "field": "price",
        "reason": "price unknown"
      }
    ],
    "expectedLineHints": [
      {
        "descriptionMatch": "acid",
        "amountMustBeAbsent": true,
        "unitPriceMustBeAbsent": true
      }
    ],
    "invariants": [
      "unknown_price_not_zero",
      "no_evidence_no_invented_money",
      "unresolved_facts_visible",
      "blockers_prevent_silent_finalization",
      "deterministic_arithmetic_only"
    ],
    "rationale": "Missing-price material must surface even if model omits it from structured draft.",
    "relatedAG": [
      "AG-082"
    ],
    "candidates": [
      {
        "label": "silent-omit-pass",
        "lineItems": [
          {
            "description": "Brushing",
            "quantity": 1,
            "unitPrice": 50,
            "amount": 50
          }
        ],
        "expectViolations": true,
        "expectedViolationIds": [
          "unresolved_facts_visible",
          "blockers_prevent_silent_finalization"
        ],
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "needsFollowUp": false
      },
      {
        "label": "restored-unresolved",
        "lineItems": [
          {
            "description": "Acid"
          },
          {
            "description": "Brushing",
            "quantity": 1,
            "unitPrice": 50,
            "amount": 50
          }
        ],
        "expectViolations": false,
        "openDecisions": [
          {
            "prompt": "Confirm unit price for \"Acid\"?",
            "fieldHint": "price",
            "subjectHint": "acid"
          }
        ],
        "qualityGateStatus": "needs_review",
        "needsFollowUp": true
      }
    ]
  },
  {
    "id": "GC-003",
    "category": "missing_price",
    "title": "Missing labor rate leaves hours, clears amount (AG-094)",
    "messyInput": "Repaired pump for 2 hours, but rate unknown",
    "expectedFacts": [
      {
        "subject": "repaired pump",
        "kind": "labor",
        "field": "hours",
        "state": "known",
        "value": 2
      },
      {
        "subject": "repaired pump",
        "kind": "labor",
        "field": "rate",
        "state": "unresolved"
      }
    ],
    "expectedUnresolved": [
      {
        "subject": "repaired pump",
        "field": "rate",
        "reason": "rate unknown"
      }
    ],
    "expectedLineHints": [
      {
        "descriptionMatch": "pump",
        "type": "labor",
        "quantity": 2,
        "amountMustBeAbsent": true,
        "unitPriceMustBeAbsent": true
      }
    ],
    "invariants": [
      "unknown_price_not_zero",
      "no_evidence_no_invented_money",
      "unresolved_facts_visible",
      "blockers_prevent_silent_finalization",
      "deterministic_arithmetic_only",
      "no_evidence_no_invented_money"
    ],
    "rationale": "Missing rate binds labor; must not invent material or default rate.",
    "relatedAG": [
      "AG-094"
    ],
    "candidates": [
      {
        "label": "invented-rate",
        "lineItems": [
          {
            "type": "labor",
            "description": "Repaired pump",
            "quantity": 2,
            "unitPrice": 125,
            "amount": 250
          }
        ],
        "expectViolations": true,
        "expectedViolationIds": [
          "no_evidence_no_invented_money",
          "blockers_prevent_silent_finalization"
        ],
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "needsFollowUp": false
      },
      {
        "label": "hours-kept",
        "lineItems": [
          {
            "type": "labor",
            "description": "Repaired pump",
            "quantity": 2
          }
        ],
        "expectViolations": false,
        "openDecisions": [
          {
            "prompt": "Confirm rate for \"Repaired pump\"?",
            "fieldHint": "rate",
            "subjectHint": "repaired pump"
          }
        ],
        "qualityGateStatus": "needs_review",
        "needsFollowUp": true
      }
    ]
  },
  {
    "id": "GC-004",
    "category": "missing_quantity",
    "title": "Quantity unknown cannot default to 1 (AG-088)",
    "messyInput": "Added acid jugs at $74 each but quantity not recorded.",
    "expectedFacts": [
      {
        "subject": "acid jugs",
        "kind": "material",
        "field": "price",
        "state": "known",
        "value": 74
      },
      {
        "subject": "acid jugs",
        "kind": "material",
        "field": "quantity",
        "state": "unresolved"
      }
    ],
    "expectedUnresolved": [
      {
        "subject": "acid jugs",
        "field": "quantity",
        "reason": "quantity not recorded"
      }
    ],
    "expectedLineHints": [
      {
        "descriptionMatch": "acid jugs",
        "unitPrice": 74,
        "quantityMustBeAbsent": true,
        "amountMustBeAbsent": true
      }
    ],
    "invariants": [
      "unknown_quantity_not_one",
      "no_evidence_no_invented_money",
      "unresolved_facts_visible",
      "blockers_prevent_silent_finalization",
      "later_evidence_field_scoped",
      "deterministic_arithmetic_only"
    ],
    "rationale": "Explicit missing quantity must not default to 1 or derive amount.",
    "relatedAG": [
      "AG-088",
      "AG-094"
    ],
    "candidates": [
      {
        "label": "default-qty-1",
        "lineItems": [
          {
            "description": "Acid jugs",
            "quantity": 1,
            "unitPrice": 74,
            "amount": 74
          }
        ],
        "expectViolations": true,
        "expectedViolationIds": [
          "unknown_quantity_not_one",
          "blockers_prevent_silent_finalization"
        ],
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "needsFollowUp": false
      },
      {
        "label": "qty-absent",
        "lineItems": [
          {
            "description": "Acid jugs",
            "unitPrice": 74
          }
        ],
        "expectViolations": false,
        "openDecisions": [
          {
            "prompt": "Confirm quantity for \"Acid jugs\"?",
            "fieldHint": "quantity",
            "subjectHint": "acid jugs"
          }
        ],
        "qualityGateStatus": "needs_review",
        "needsFollowUp": true
      }
    ]
  },
  {
    "id": "GC-005",
    "category": "missing_quantity",
    "title": "Later cost cannot resolve missing quantity (AG-094)",
    "messyInput": "Added acid jugs but quantity unknown. Acid jugs cost $74 each.",
    "expectedFacts": [
      {
        "subject": "acid jugs",
        "kind": "material",
        "field": "quantity",
        "state": "unresolved"
      },
      {
        "subject": "acid jugs",
        "kind": "material",
        "field": "cost",
        "state": "known",
        "value": 74
      }
    ],
    "expectedUnresolved": [
      {
        "subject": "acid jugs",
        "field": "quantity",
        "reason": "quantity unknown"
      }
    ],
    "expectedLineHints": [
      {
        "descriptionMatch": "acid jugs",
        "unitPrice": 74,
        "quantityMustBeAbsent": true,
        "amountMustBeAbsent": true
      }
    ],
    "invariants": [
      "unknown_quantity_not_one",
      "no_evidence_no_invented_money",
      "unresolved_facts_visible",
      "blockers_prevent_silent_finalization",
      "later_evidence_field_scoped",
      "deterministic_arithmetic_only"
    ],
    "rationale": "Field-scoped resolution: cost evidence must not fill quantity.",
    "relatedAG": [
      "AG-094"
    ],
    "candidates": [
      {
        "label": "cost-fills-qty",
        "lineItems": [
          {
            "description": "Acid jugs",
            "quantity": 1,
            "unitPrice": 74,
            "amount": 74
          }
        ],
        "expectViolations": true,
        "expectedViolationIds": [
          "later_evidence_field_scoped",
          "unknown_quantity_not_one"
        ],
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "needsFollowUp": false
      },
      {
        "label": "cost-only",
        "lineItems": [
          {
            "description": "Acid jugs",
            "unitPrice": 74
          }
        ],
        "expectViolations": false,
        "openDecisions": [
          {
            "prompt": "Confirm quantity for \"Acid jugs\"?",
            "fieldHint": "quantity",
            "subjectHint": "acid jugs"
          }
        ],
        "qualityGateStatus": "needs_review",
        "needsFollowUp": true
      }
    ]
  },
  {
    "id": "GC-006",
    "category": "later_correction",
    "title": "Later quantity correction supersedes unresolved",
    "messyInput": "Added acid jugs but quantity unknown. Acid jugs quantity is 2.",
    "expectedFacts": [
      {
        "subject": "acid jugs",
        "kind": "material",
        "field": "quantity",
        "state": "known",
        "value": 2
      }
    ],
    "expectedUnresolved": [],
    "expectedLineHints": [
      {
        "descriptionMatch": "acid jugs",
        "quantity": 2
      }
    ],
    "invariants": [
      "deterministic_arithmetic_only",
      "later_evidence_field_scoped",
      "unresolved_facts_visible",
      "blockers_prevent_silent_finalization"
    ],
    "rationale": "Later same-subject quantity evidence resolves before invoice application.",
    "relatedAG": [
      "AG-094"
    ],
    "candidates": [
      {
        "label": "corrected-qty",
        "lineItems": [
          {
            "description": "Acid jugs",
            "quantity": 2,
            "unitPrice": 74,
            "amount": 148
          }
        ],
        "expectViolations": false,
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "subtotal": 148
      },
      {
        "label": "stale-wrong-qty",
        "lineItems": [
          {
            "description": "Acid jugs",
            "quantity": 1,
            "unitPrice": 74,
            "amount": 74
          }
        ],
        "expectViolations": true,
        "expectedViolationIds": [
          "deterministic_arithmetic_only"
        ],
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "needsFollowUp": false
      }
    ]
  },
  {
    "id": "GC-007",
    "category": "later_correction",
    "title": "Actually make that 8 hours",
    "messyInput": "Painted fence about 5 hours at $60/hr. Actually make that 8 hours.",
    "expectedFacts": [
      {
        "subject": "painted fence",
        "kind": "labor",
        "field": "hours",
        "state": "known",
        "value": 8
      },
      {
        "subject": "painted fence",
        "kind": "labor",
        "field": "rate",
        "state": "known",
        "value": 60
      },
      {
        "subject": "painted fence",
        "kind": "labor",
        "field": "amount",
        "state": "known",
        "value": 480
      }
    ],
    "expectedUnresolved": [],
    "expectedLineHints": [
      {
        "descriptionMatch": "fence|paint",
        "type": "labor",
        "quantity": 8,
        "unitPrice": 60,
        "amount": 480
      }
    ],
    "invariants": [
      "deterministic_arithmetic_only",
      "later_evidence_field_scoped",
      "no_evidence_no_invented_money"
    ],
    "rationale": "Correction replaces earlier hours; arithmetic must be 8*60.",
    "candidates": [
      {
        "label": "corrected-8h",
        "lineItems": [
          {
            "type": "labor",
            "description": "Painted fence",
            "quantity": 8,
            "unitPrice": 60,
            "amount": 480
          }
        ],
        "expectViolations": false,
        "qualityGateStatus": "pass",
        "subtotal": 480
      },
      {
        "label": "kept-5h",
        "lineItems": [
          {
            "type": "labor",
            "description": "Painted fence",
            "quantity": 5,
            "unitPrice": 60,
            "amount": 300
          }
        ],
        "expectViolations": true,
        "expectedViolationIds": [
          "deterministic_arithmetic_only"
        ],
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "needsFollowUp": false
      }
    ]
  },
  {
    "id": "GC-008",
    "category": "two_workers",
    "title": "Two-worker deterministic worker-hours (AG-082)",
    "messyInput": "Brush clearing: Dave 3 hours and Sam 4 hours at $55/hr each.",
    "expectedFacts": [
      {
        "subject": "brush clearing",
        "kind": "labor",
        "field": "hours",
        "state": "known",
        "value": 7
      },
      {
        "subject": "brush clearing",
        "kind": "labor",
        "field": "rate",
        "state": "known",
        "value": 55
      },
      {
        "subject": "brush clearing",
        "kind": "labor",
        "field": "amount",
        "state": "known",
        "value": 385
      }
    ],
    "expectedUnresolved": [],
    "expectedLineHints": [
      {
        "descriptionMatch": "brush",
        "type": "labor",
        "quantity": 7,
        "unitPrice": 55,
        "amount": 385
      }
    ],
    "invariants": [
      "deterministic_arithmetic_only",
      "no_evidence_no_invented_money"
    ],
    "rationale": "Worker-hours sum deterministically; do not invent a third rate.",
    "relatedAG": [
      "AG-082"
    ],
    "candidates": [
      {
        "label": "seven-hours",
        "lineItems": [
          {
            "type": "labor",
            "description": "Brush clearing",
            "quantity": 7,
            "unitPrice": 55,
            "amount": 385
          }
        ],
        "expectViolations": false,
        "qualityGateStatus": "pass",
        "subtotal": 385
      },
      {
        "label": "wrong-product",
        "lineItems": [
          {
            "type": "labor",
            "description": "Brush clearing",
            "quantity": 7,
            "unitPrice": 55,
            "amount": 400
          }
        ],
        "expectViolations": true,
        "expectedViolationIds": [
          "deterministic_arithmetic_only"
        ],
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "needsFollowUp": false
      }
    ]
  },
  {
    "id": "GC-009",
    "category": "two_workers",
    "title": "Two workers different rates stay separate",
    "messyInput": "Roof repair: Jordan 2h @ $90/hr, Casey 3h @ $70/hr.",
    "expectedFacts": [
      {
        "subject": "jordan",
        "kind": "labor",
        "field": "amount",
        "state": "known",
        "value": 180
      },
      {
        "subject": "casey",
        "kind": "labor",
        "field": "amount",
        "state": "known",
        "value": 210
      }
    ],
    "expectedUnresolved": [],
    "expectedLineHints": [
      {
        "descriptionMatch": "Jordan",
        "amount": 180
      },
      {
        "descriptionMatch": "Casey",
        "amount": 210
      }
    ],
    "invariants": [
      "deterministic_arithmetic_only",
      "no_evidence_no_invented_money"
    ],
    "rationale": "Different worker rates must not be averaged into one invented line.",
    "candidates": [
      {
        "label": "separate-lines",
        "lineItems": [
          {
            "type": "labor",
            "description": "Roof repair Jordan",
            "quantity": 2,
            "unitPrice": 90,
            "amount": 180
          },
          {
            "type": "labor",
            "description": "Roof repair Casey",
            "quantity": 3,
            "unitPrice": 70,
            "amount": 210
          }
        ],
        "expectViolations": false,
        "qualityGateStatus": "pass",
        "subtotal": 390
      },
      {
        "label": "averaged-rate",
        "lineItems": [
          {
            "type": "labor",
            "description": "Roof repair Jordan",
            "quantity": 2,
            "unitPrice": 90,
            "amount": 200
          },
          {
            "type": "labor",
            "description": "Roof repair Casey",
            "quantity": 3,
            "unitPrice": 70,
            "amount": 210
          }
        ],
        "expectViolations": true,
        "expectedViolationIds": [
          "deterministic_arithmetic_only"
        ],
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "needsFollowUp": false
      }
    ]
  },
  {
    "id": "GC-010",
    "category": "ambiguous_hours",
    "title": "Maybe 2 or 3 hours stays unresolved",
    "messyInput": "Fixed dishwasher, maybe 2 or 3 hours at $85/hr.",
    "expectedFacts": [
      {
        "subject": "dishwasher",
        "kind": "labor",
        "field": "hours",
        "state": "unresolved"
      },
      {
        "subject": "dishwasher",
        "kind": "labor",
        "field": "rate",
        "state": "known",
        "value": 85
      }
    ],
    "expectedUnresolved": [
      {
        "subject": "dishwasher",
        "field": "hours",
        "reason": "ambiguous 2 or 3 hours"
      }
    ],
    "expectedLineHints": [
      {
        "descriptionMatch": "dishwasher",
        "unitPrice": 85,
        "quantityMustBeAbsent": true,
        "amountMustBeAbsent": true
      }
    ],
    "invariants": [
      "unresolved_facts_visible",
      "blockers_prevent_silent_finalization",
      "no_evidence_no_invented_money",
      "deterministic_arithmetic_only"
    ],
    "rationale": "Ambiguous hours must not pick a side silently.",
    "candidates": [
      {
        "label": "picked-2",
        "lineItems": [
          {
            "type": "labor",
            "description": "Fixed dishwasher",
            "quantity": 2,
            "unitPrice": 85,
            "amount": 170
          }
        ],
        "expectViolations": true,
        "expectedViolationIds": [
          "no_evidence_no_invented_money",
          "blockers_prevent_silent_finalization"
        ],
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "needsFollowUp": false
      },
      {
        "label": "hours-open",
        "lineItems": [
          {
            "type": "labor",
            "description": "Fixed dishwasher",
            "unitPrice": 85
          }
        ],
        "expectViolations": false,
        "openDecisions": [
          {
            "prompt": "Confirm hours for dishwasher repair (2 or 3)?",
            "fieldHint": "hours",
            "subjectHint": "dishwasher"
          }
        ],
        "qualityGateStatus": "needs_review",
        "needsFollowUp": true
      }
    ]
  },
  {
    "id": "GC-011",
    "category": "ambiguous_hours",
    "title": "About half a day without conversion authority",
    "messyInput": "Yard cleanup about half a day. Rate usually $60/hr but not sure how many hours to bill.",
    "expectedFacts": [
      {
        "subject": "yard cleanup",
        "kind": "labor",
        "field": "hours",
        "state": "unresolved"
      },
      {
        "subject": "yard cleanup",
        "kind": "labor",
        "field": "rate",
        "state": "known",
        "value": 60
      }
    ],
    "expectedUnresolved": [
      {
        "subject": "yard cleanup",
        "field": "hours",
        "reason": "half a day ambiguous"
      }
    ],
    "expectedLineHints": [
      {
        "descriptionMatch": "yard",
        "amountMustBeAbsent": true,
        "quantityMustBeAbsent": true
      }
    ],
    "invariants": [
      "unresolved_facts_visible",
      "blockers_prevent_silent_finalization",
      "no_evidence_no_invented_money"
    ],
    "rationale": "Colloquial duration must not invent hours.",
    "candidates": [
      {
        "label": "invented-4h",
        "lineItems": [
          {
            "type": "labor",
            "description": "Yard cleanup",
            "quantity": 4,
            "unitPrice": 60,
            "amount": 240
          }
        ],
        "expectViolations": true,
        "expectedViolationIds": [
          "no_evidence_no_invented_money"
        ],
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "needsFollowUp": false
      },
      {
        "label": "open-hours",
        "lineItems": [
          {
            "type": "labor",
            "description": "Yard cleanup",
            "unitPrice": 60
          }
        ],
        "expectViolations": false,
        "openDecisions": [
          {
            "prompt": "Confirm billable hours for yard cleanup?",
            "fieldHint": "hours",
            "subjectHint": "yard cleanup"
          }
        ],
        "qualityGateStatus": "needs_review",
        "needsFollowUp": true
      }
    ]
  },
  {
    "id": "GC-012",
    "category": "free_no_charge",
    "title": "Explicit no-charge inspection is $0 for that visit only",
    "messyInput": "Jan 28 inspection visit, no charge, maybe 30 mins. Jan 30 faucet repair 2h @ $80/hr.",
    "expectedFacts": [
      {
        "subject": "inspection visit",
        "kind": "labor",
        "field": "amount",
        "state": "waived"
      },
      {
        "subject": "faucet repair",
        "kind": "labor",
        "field": "amount",
        "state": "known",
        "value": 160
      }
    ],
    "expectedUnresolved": [],
    "expectedLineHints": [
      {
        "descriptionMatch": "inspection",
        "allowExplicitZero": true,
        "amount": 0
      },
      {
        "descriptionMatch": "faucet",
        "amount": 160
      }
    ],
    "invariants": [
      "free_is_subject_bound",
      "unknown_price_not_zero",
      "no_evidence_no_invented_money",
      "deterministic_arithmetic_only",
      "unresolved_facts_visible",
      "blockers_prevent_silent_finalization"
    ],
    "rationale": "Explicit free is allowed for the named subject only.",
    "relatedAG": [
      "AG-082"
    ],
    "candidates": [
      {
        "label": "waived-inspection",
        "lineItems": [
          {
            "type": "labor",
            "description": "Inspection visit",
            "quantity": 0.5,
            "unitPrice": 0,
            "amount": 0
          },
          {
            "type": "labor",
            "description": "Faucet repair",
            "quantity": 2,
            "unitPrice": 80,
            "amount": 160
          }
        ],
        "expectViolations": false,
        "qualityGateStatus": "pass",
        "subtotal": 160
      },
      {
        "label": "zeroed-faucet",
        "lineItems": [
          {
            "type": "labor",
            "description": "Inspection visit",
            "amount": 0
          },
          {
            "type": "labor",
            "description": "Faucet repair",
            "quantity": 2,
            "unitPrice": 0,
            "amount": 0
          }
        ],
        "expectViolations": true,
        "expectedViolationIds": [
          "free_is_subject_bound",
          "no_evidence_no_invented_money"
        ],
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "needsFollowUp": false
      }
    ]
  },
  {
    "id": "GC-013",
    "category": "free_no_charge",
    "title": "No-charge pump cannot authorize pump baskets $0 (AG-088/094)",
    "messyInput": "No charge for pump. Cleaned pump baskets.",
    "expectedFacts": [
      {
        "subject": "pump",
        "kind": "labor",
        "field": "amount",
        "state": "waived"
      },
      {
        "subject": "cleaned pump baskets",
        "kind": "labor",
        "field": "amount",
        "state": "unresolved"
      }
    ],
    "expectedUnresolved": [
      {
        "subject": "cleaned pump baskets",
        "field": "amount",
        "reason": "no price stated; shared noun with waived pump"
      }
    ],
    "expectedLineHints": [
      {
        "descriptionMatch": "^pump$",
        "allowExplicitZero": true,
        "amount": 0
      },
      {
        "descriptionMatch": "basket",
        "amountMustBeAbsent": true
      }
    ],
    "invariants": [
      "free_is_subject_bound",
      "unknown_price_not_zero",
      "no_evidence_no_invented_money",
      "deterministic_arithmetic_only",
      "unresolved_facts_visible",
      "blockers_prevent_silent_finalization"
    ],
    "rationale": "Shared noun must not leak waived $0 to a different task.",
    "relatedAG": [
      "AG-088",
      "AG-094"
    ],
    "candidates": [
      {
        "label": "baskets-zeroed",
        "lineItems": [
          {
            "description": "Pump",
            "amount": 0
          },
          {
            "description": "Cleaned pump baskets",
            "amount": 0
          }
        ],
        "expectViolations": true,
        "expectedViolationIds": [
          "free_is_subject_bound"
        ],
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "needsFollowUp": false
      },
      {
        "label": "baskets-open",
        "lineItems": [
          {
            "description": "Pump",
            "amount": 0
          }
        ],
        "expectViolations": false,
        "openDecisions": [
          {
            "prompt": "Bill cleaned pump baskets?",
            "fieldHint": "amount",
            "subjectHint": "cleaned pump baskets"
          }
        ],
        "qualityGateStatus": "needs_review",
        "needsFollowUp": true
      }
    ]
  },
  {
    "id": "GC-014",
    "category": "free_no_charge",
    "title": "Complimentary part is subject-bound waived",
    "messyInput": "Replaced gasket complimentary. Labor 1h @ $95/hr.",
    "expectedFacts": [
      {
        "subject": "gasket",
        "kind": "material",
        "field": "price",
        "state": "waived"
      },
      {
        "subject": "labor",
        "kind": "labor",
        "field": "amount",
        "state": "known",
        "value": 95
      }
    ],
    "expectedUnresolved": [],
    "expectedLineHints": [
      {
        "descriptionMatch": "gasket",
        "allowExplicitZero": true,
        "amount": 0
      },
      {
        "descriptionMatch": "labor|service|repair",
        "amount": 95
      }
    ],
    "invariants": [
      "free_is_subject_bound",
      "unknown_price_not_zero",
      "no_evidence_no_invented_money",
      "deterministic_arithmetic_only",
      "unresolved_facts_visible",
      "blockers_prevent_silent_finalization"
    ],
    "rationale": "Complimentary applies only to the gasket.",
    "candidates": [
      {
        "label": "gasket-free",
        "lineItems": [
          {
            "type": "material",
            "description": "Gasket",
            "quantity": 1,
            "unitPrice": 0,
            "amount": 0
          },
          {
            "type": "labor",
            "description": "Service labor",
            "quantity": 1,
            "unitPrice": 95,
            "amount": 95
          }
        ],
        "expectViolations": false,
        "qualityGateStatus": "pass",
        "subtotal": 95
      },
      {
        "label": "labor-zero",
        "lineItems": [
          {
            "type": "material",
            "description": "Gasket",
            "amount": 0
          },
          {
            "type": "labor",
            "description": "Service labor",
            "quantity": 1,
            "unitPrice": 0,
            "amount": 0
          }
        ],
        "expectViolations": true,
        "expectedViolationIds": [
          "free_is_subject_bound"
        ],
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "needsFollowUp": false
      }
    ]
  },
  {
    "id": "GC-015",
    "category": "deposit_paid",
    "title": "Deposit already paid reduces balance, not line invention",
    "messyInput": "Kitchen remodel progress: cabinets $1200, install labor $800. Client already paid $500 deposit.",
    "expectedFacts": [
      {
        "subject": "cabinets",
        "kind": "material",
        "field": "amount",
        "state": "known",
        "value": 1200
      },
      {
        "subject": "install labor",
        "kind": "labor",
        "field": "amount",
        "state": "known",
        "value": 800
      },
      {
        "subject": "deposit",
        "kind": "payment",
        "field": "deposit",
        "state": "known",
        "value": 500
      }
    ],
    "expectedUnresolved": [],
    "expectedLineHints": [
      {
        "descriptionMatch": "cabinet",
        "amount": 1200
      },
      {
        "descriptionMatch": "install|labor",
        "amount": 800
      }
    ],
    "invariants": [
      "deterministic_arithmetic_only",
      "no_evidence_no_invented_money"
    ],
    "rationale": "Deposit is payment progress, not a negative invented line without evidence shape.",
    "candidates": [
      {
        "label": "deposit-applied",
        "lineItems": [
          {
            "description": "Cabinets",
            "amount": 1200
          },
          {
            "type": "labor",
            "description": "Install labor",
            "amount": 800
          }
        ],
        "expectViolations": false,
        "qualityGateStatus": "pass",
        "subtotal": 2000,
        "total": 1500,
        "depositApplied": 500
      },
      {
        "label": "deposit-fake-math",
        "lineItems": [
          {
            "description": "Cabinets",
            "amount": 1200
          },
          {
            "type": "labor",
            "description": "Install labor",
            "amount": 800
          },
          {
            "description": "Deposit",
            "amount": -500
          }
        ],
        "expectViolations": true,
        "expectedViolationIds": [
          "deterministic_arithmetic_only"
        ],
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "needsFollowUp": false,
        "subtotal": 2000,
        "total": 1000
      }
    ]
  },
  {
    "id": "GC-016",
    "category": "deposit_paid",
    "title": "Deposit mentioned without amount stays unresolved",
    "messyInput": "Fence staining 6h @ $50/hr. They paid a deposit earlier but I forgot how much.",
    "expectedFacts": [
      {
        "subject": "fence staining",
        "kind": "labor",
        "field": "amount",
        "state": "known",
        "value": 300
      },
      {
        "subject": "deposit",
        "kind": "payment",
        "field": "deposit",
        "state": "unresolved"
      }
    ],
    "expectedUnresolved": [
      {
        "subject": "deposit",
        "field": "deposit",
        "reason": "amount forgotten"
      }
    ],
    "expectedLineHints": [
      {
        "descriptionMatch": "fence|stain",
        "amount": 300
      }
    ],
    "invariants": [
      "unresolved_facts_visible",
      "blockers_prevent_silent_finalization",
      "no_evidence_no_invented_money",
      "deterministic_arithmetic_only"
    ],
    "rationale": "Unknown deposit must not invent a round number.",
    "candidates": [
      {
        "label": "invented-deposit-100",
        "lineItems": [
          {
            "type": "labor",
            "description": "Fence staining",
            "quantity": 6,
            "unitPrice": 50,
            "amount": 300
          }
        ],
        "expectViolations": true,
        "expectedViolationIds": [
          "unresolved_facts_visible",
          "blockers_prevent_silent_finalization"
        ],
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "needsFollowUp": false,
        "depositApplied": 100
      },
      {
        "label": "ask-deposit",
        "lineItems": [
          {
            "type": "labor",
            "description": "Fence staining",
            "quantity": 6,
            "unitPrice": 50,
            "amount": 300
          }
        ],
        "expectViolations": false,
        "openDecisions": [
          {
            "prompt": "Confirm deposit amount already paid?",
            "fieldHint": "deposit",
            "subjectHint": "deposit"
          }
        ],
        "qualityGateStatus": "needs_review",
        "needsFollowUp": true
      }
    ]
  },
  {
    "id": "GC-017",
    "category": "unit_vs_total_price",
    "title": "Unit price vs total price ambiguity",
    "messyInput": "Bought 4 LED fixtures for $240. Not sure if that was each or total.",
    "expectedFacts": [
      {
        "subject": "LED fixtures",
        "kind": "material",
        "field": "quantity",
        "state": "known",
        "value": 4
      },
      {
        "subject": "LED fixtures",
        "kind": "material",
        "field": "price",
        "state": "unresolved"
      }
    ],
    "expectedUnresolved": [
      {
        "subject": "LED fixtures",
        "field": "price",
        "reason": "each vs total ambiguous"
      }
    ],
    "expectedLineHints": [
      {
        "descriptionMatch": "LED|fixture",
        "quantity": 4,
        "amountMustBeAbsent": true
      }
    ],
    "invariants": [
      "unresolved_facts_visible",
      "blockers_prevent_silent_finalization",
      "no_evidence_no_invented_money",
      "unknown_price_not_zero"
    ],
    "rationale": "Ambiguous unit-vs-total must block silent pricing.",
    "candidates": [
      {
        "label": "assumed-each",
        "lineItems": [
          {
            "description": "LED fixtures",
            "quantity": 4,
            "unitPrice": 240,
            "amount": 960
          }
        ],
        "expectViolations": true,
        "expectedViolationIds": [
          "no_evidence_no_invented_money"
        ],
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "needsFollowUp": false
      },
      {
        "label": "assumed-total-silent",
        "lineItems": [
          {
            "description": "LED fixtures",
            "quantity": 4,
            "unitPrice": 60,
            "amount": 240
          }
        ],
        "expectViolations": true,
        "expectedViolationIds": [
          "blockers_prevent_silent_finalization",
          "unresolved_facts_visible"
        ],
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "needsFollowUp": false
      },
      {
        "label": "ask-each-or-total",
        "lineItems": [
          {
            "description": "LED fixtures",
            "quantity": 4
          }
        ],
        "expectViolations": false,
        "openDecisions": [
          {
            "prompt": "Is $240 each or total for LED fixtures?",
            "fieldHint": "price",
            "subjectHint": "LED fixtures"
          }
        ],
        "qualityGateStatus": "needs_review",
        "needsFollowUp": true
      }
    ]
  },
  {
    "id": "GC-018",
    "category": "unit_vs_total_price",
    "title": "Explicit each is deterministic",
    "messyInput": "Added 3 filters at $18 each.",
    "expectedFacts": [
      {
        "subject": "filters",
        "kind": "material",
        "field": "quantity",
        "state": "known",
        "value": 3
      },
      {
        "subject": "filters",
        "kind": "material",
        "field": "price",
        "state": "known",
        "value": 18
      },
      {
        "subject": "filters",
        "kind": "material",
        "field": "amount",
        "state": "known",
        "value": 54
      }
    ],
    "expectedUnresolved": [],
    "expectedLineHints": [
      {
        "descriptionMatch": "filter",
        "quantity": 3,
        "unitPrice": 18,
        "amount": 54
      }
    ],
    "invariants": [
      "deterministic_arithmetic_only",
      "no_evidence_no_invented_money"
    ],
    "rationale": "Explicit each supports deterministic qty*unit.",
    "candidates": [
      {
        "label": "filters-54",
        "lineItems": [
          {
            "description": "Filters",
            "quantity": 3,
            "unitPrice": 18,
            "amount": 54
          }
        ],
        "expectViolations": false,
        "qualityGateStatus": "pass",
        "subtotal": 54
      },
      {
        "label": "wrong-math",
        "lineItems": [
          {
            "description": "Filters",
            "quantity": 3,
            "unitPrice": 18,
            "amount": 18
          }
        ],
        "expectViolations": true,
        "expectedViolationIds": [
          "deterministic_arithmetic_only"
        ],
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "needsFollowUp": false
      }
    ]
  },
  {
    "id": "GC-019",
    "category": "similar_material_names",
    "title": "Acid vs acid wash stay discriminative (AG-094)",
    "messyInput": "Added 1 acid but price unknown. Acid wash for $200.",
    "expectedFacts": [
      {
        "subject": "acid",
        "kind": "material",
        "field": "price",
        "state": "unresolved"
      },
      {
        "subject": "acid wash",
        "kind": "material",
        "field": "price",
        "state": "known",
        "value": 200
      }
    ],
    "expectedUnresolved": [
      {
        "subject": "acid",
        "field": "price",
        "reason": "price unknown"
      }
    ],
    "expectedLineHints": [
      {
        "descriptionMatch": "^acid$",
        "amountMustBeAbsent": true,
        "unitPriceMustBeAbsent": true
      },
      {
        "descriptionMatch": "acid wash",
        "amount": 200
      }
    ],
    "invariants": [
      "unknown_price_not_zero",
      "no_evidence_no_invented_money",
      "unresolved_facts_visible",
      "blockers_prevent_silent_finalization",
      "deterministic_arithmetic_only",
      "later_evidence_field_scoped"
    ],
    "rationale": "Similar names must not cross-apply pricing.",
    "relatedAG": [
      "AG-094"
    ],
    "candidates": [
      {
        "label": "wash-zeros-acid",
        "lineItems": [
          {
            "description": "Acid",
            "quantity": 1,
            "unitPrice": 0,
            "amount": 0
          },
          {
            "description": "Acid wash",
            "quantity": 1,
            "unitPrice": 200,
            "amount": 200
          }
        ],
        "expectViolations": true,
        "expectedViolationIds": [
          "unknown_price_not_zero"
        ],
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "needsFollowUp": false
      },
      {
        "label": "discriminative",
        "lineItems": [
          {
            "description": "Acid",
            "quantity": 1
          },
          {
            "description": "Acid wash",
            "quantity": 1,
            "unitPrice": 200,
            "amount": 200
          }
        ],
        "expectViolations": false,
        "openDecisions": [
          {
            "prompt": "Confirm unit price for \"Acid\"?",
            "fieldHint": "price",
            "subjectHint": "acid"
          }
        ],
        "qualityGateStatus": "needs_review",
        "needsFollowUp": true
      }
    ]
  },
  {
    "id": "GC-020",
    "category": "similar_material_names",
    "title": "Filter cartridge vs filter housing",
    "messyInput": "Replaced filter cartridge $22. Filter housing looked fine, no charge.",
    "expectedFacts": [
      {
        "subject": "filter cartridge",
        "kind": "material",
        "field": "price",
        "state": "known",
        "value": 22
      },
      {
        "subject": "filter housing",
        "kind": "material",
        "field": "price",
        "state": "waived"
      }
    ],
    "expectedUnresolved": [],
    "expectedLineHints": [
      {
        "descriptionMatch": "cartridge",
        "amount": 22
      },
      {
        "descriptionMatch": "housing",
        "allowExplicitZero": true,
        "amount": 0
      }
    ],
    "invariants": [
      "free_is_subject_bound",
      "unknown_price_not_zero",
      "no_evidence_no_invented_money",
      "deterministic_arithmetic_only",
      "unresolved_facts_visible",
      "blockers_prevent_silent_finalization"
    ],
    "rationale": "Similar filter* names remain separate subjects.",
    "candidates": [
      {
        "label": "separate",
        "lineItems": [
          {
            "description": "Filter cartridge",
            "quantity": 1,
            "unitPrice": 22,
            "amount": 22
          },
          {
            "description": "Filter housing",
            "quantity": 1,
            "unitPrice": 0,
            "amount": 0
          }
        ],
        "expectViolations": false,
        "qualityGateStatus": "pass",
        "subtotal": 22
      },
      {
        "label": "both-zero",
        "lineItems": [
          {
            "description": "Filter cartridge",
            "amount": 0
          },
          {
            "description": "Filter housing",
            "amount": 0
          }
        ],
        "expectViolations": true,
        "expectedViolationIds": [
          "free_is_subject_bound",
          "no_evidence_no_invented_money"
        ],
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "needsFollowUp": false
      }
    ]
  },
  {
    "id": "GC-021",
    "category": "same_noun_different_tasks",
    "title": "Pump repair vs pump cleaning",
    "messyInput": "Pump repair 1.5h @ $110/hr. Also pump cleaning \u2014 didn't decide pricing yet.",
    "expectedFacts": [
      {
        "subject": "pump repair",
        "kind": "labor",
        "field": "amount",
        "state": "known",
        "value": 165
      },
      {
        "subject": "pump cleaning",
        "kind": "labor",
        "field": "amount",
        "state": "unresolved"
      }
    ],
    "expectedUnresolved": [
      {
        "subject": "pump cleaning",
        "field": "amount",
        "reason": "pricing not decided"
      }
    ],
    "expectedLineHints": [
      {
        "descriptionMatch": "repair",
        "amount": 165
      },
      {
        "descriptionMatch": "clean",
        "amountMustBeAbsent": true
      }
    ],
    "invariants": [
      "free_is_subject_bound",
      "unresolved_facts_visible",
      "blockers_prevent_silent_finalization",
      "no_evidence_no_invented_money",
      "deterministic_arithmetic_only"
    ],
    "rationale": "Same noun across tasks must not copy pricing.",
    "candidates": [
      {
        "label": "copied-rate",
        "lineItems": [
          {
            "type": "labor",
            "description": "Pump repair",
            "quantity": 1.5,
            "unitPrice": 110,
            "amount": 165
          },
          {
            "type": "labor",
            "description": "Pump cleaning",
            "quantity": 1.5,
            "unitPrice": 110,
            "amount": 165
          }
        ],
        "expectViolations": true,
        "expectedViolationIds": [
          "no_evidence_no_invented_money"
        ],
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "needsFollowUp": false
      },
      {
        "label": "cleaning-open",
        "lineItems": [
          {
            "type": "labor",
            "description": "Pump repair",
            "quantity": 1.5,
            "unitPrice": 110,
            "amount": 165
          },
          {
            "type": "labor",
            "description": "Pump cleaning"
          }
        ],
        "expectViolations": false,
        "openDecisions": [
          {
            "prompt": "Confirm pricing for pump cleaning?",
            "fieldHint": "amount",
            "subjectHint": "pump cleaning"
          }
        ],
        "qualityGateStatus": "needs_review",
        "needsFollowUp": true
      }
    ]
  },
  {
    "id": "GC-022",
    "category": "same_noun_different_tasks",
    "title": "Ambiguous duplicate filter lines fail closed (AG-094)",
    "messyInput": "Added filter but price unknown",
    "expectedFacts": [
      {
        "subject": "filter",
        "kind": "material",
        "field": "price",
        "state": "unresolved"
      }
    ],
    "expectedUnresolved": [
      {
        "subject": "filter",
        "field": "price",
        "reason": "price unknown; ambiguous which filter line"
      }
    ],
    "expectedLineHints": [],
    "invariants": [
      "unknown_price_not_zero",
      "no_evidence_no_invented_money",
      "unresolved_facts_visible",
      "blockers_prevent_silent_finalization",
      "deterministic_arithmetic_only"
    ],
    "rationale": "Ambiguous subject identity must not mutate sibling lines.",
    "relatedAG": [
      "AG-094"
    ],
    "candidates": [
      {
        "label": "cleared-both-silent",
        "lineItems": [
          {
            "description": "Filter",
            "quantity": 1
          },
          {
            "description": "Filter",
            "quantity": 2
          }
        ],
        "expectViolations": true,
        "expectedViolationIds": [
          "unresolved_facts_visible",
          "blockers_prevent_silent_finalization"
        ],
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "needsFollowUp": false
      },
      {
        "label": "fail-closed-keep-ask",
        "lineItems": [
          {
            "description": "Filter",
            "quantity": 1,
            "unitPrice": 40,
            "amount": 40
          },
          {
            "description": "Filter",
            "quantity": 2,
            "unitPrice": 40,
            "amount": 80
          }
        ],
        "expectViolations": false,
        "openDecisions": [
          {
            "prompt": "Confirm unit price for \"Filter\"?",
            "fieldHint": "price",
            "subjectHint": "filter"
          }
        ],
        "qualityGateStatus": "needs_review",
        "needsFollowUp": true
      }
    ]
  },
  {
    "id": "GC-023",
    "category": "unknown_tax",
    "title": "Unknown tax stays assumption, not invented rate",
    "messyInput": "Fixed sink 2h @ $90/hr. I sometimes add 5% tax, sometimes not.",
    "expectedFacts": [
      {
        "subject": "sink",
        "kind": "labor",
        "field": "amount",
        "state": "known",
        "value": 180
      },
      {
        "subject": "tax",
        "kind": "tax",
        "field": "tax",
        "state": "unresolved"
      }
    ],
    "expectedUnresolved": [
      {
        "subject": "tax",
        "field": "tax",
        "reason": "sometimes 5% sometimes not"
      }
    ],
    "expectedLineHints": [
      {
        "descriptionMatch": "sink",
        "amount": 180
      }
    ],
    "invariants": [
      "unresolved_facts_visible",
      "no_evidence_no_invented_money",
      "deterministic_arithmetic_only",
      "blockers_prevent_silent_finalization"
    ],
    "rationale": "Tax uncertainty should be visible assumption/decision, not silent 5%.",
    "candidates": [
      {
        "label": "silent-5pct",
        "lineItems": [
          {
            "type": "labor",
            "description": "Fixed sink",
            "quantity": 2,
            "unitPrice": 90,
            "amount": 180
          }
        ],
        "expectViolations": true,
        "expectedViolationIds": [
          "unresolved_facts_visible"
        ],
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "needsFollowUp": false,
        "taxRate": 0.05,
        "total": 189
      },
      {
        "label": "tax-assumption",
        "lineItems": [
          {
            "type": "labor",
            "description": "Fixed sink",
            "quantity": 2,
            "unitPrice": 90,
            "amount": 180
          }
        ],
        "expectViolations": false,
        "taxRate": 0,
        "assumptions": [
          "Tax not applied until confirmed."
        ],
        "openDecisions": [
          {
            "prompt": "Apply tax?",
            "fieldHint": "tax",
            "subjectHint": "tax"
          }
        ],
        "qualityGateStatus": "needs_review",
        "needsFollowUp": true
      }
    ]
  },
  {
    "id": "GC-024",
    "category": "unknown_tax",
    "title": "Explicit no tax is deterministic zero",
    "messyInput": "Washer replacement $45. No tax.",
    "expectedFacts": [
      {
        "subject": "washer",
        "kind": "material",
        "field": "amount",
        "state": "known",
        "value": 45
      },
      {
        "subject": "tax",
        "kind": "tax",
        "field": "tax",
        "state": "known",
        "value": 0
      }
    ],
    "expectedUnresolved": [],
    "expectedLineHints": [
      {
        "descriptionMatch": "washer",
        "amount": 45
      }
    ],
    "invariants": [
      "deterministic_arithmetic_only",
      "no_evidence_no_invented_money"
    ],
    "rationale": "Explicit no tax authorizes taxRate 0.",
    "candidates": [
      {
        "label": "no-tax",
        "lineItems": [
          {
            "description": "Washer replacement",
            "amount": 45
          }
        ],
        "expectViolations": false,
        "taxRate": 0,
        "total": 45,
        "qualityGateStatus": "pass"
      }
    ]
  },
  {
    "id": "GC-025",
    "category": "multiple_jobs",
    "title": "Multiple jobs in one note stay separated",
    "messyInput": "Job A - Smith: mow lawn $60. Job B - Lee: hedge trim 2h @ $45/hr. Don't mix them.",
    "expectedFacts": [
      {
        "subject": "mow lawn",
        "kind": "labor",
        "field": "amount",
        "state": "known",
        "value": 60
      },
      {
        "subject": "hedge trim",
        "kind": "labor",
        "field": "amount",
        "state": "known",
        "value": 90
      }
    ],
    "expectedUnresolved": [],
    "expectedLineHints": [
      {
        "descriptionMatch": "mow|lawn",
        "amount": 60
      },
      {
        "descriptionMatch": "hedge",
        "amount": 90
      }
    ],
    "invariants": [
      "deterministic_arithmetic_only",
      "no_evidence_no_invented_money"
    ],
    "rationale": "Multi-job notes must not blend totals into one invented line.",
    "candidates": [
      {
        "label": "two-jobs",
        "lineItems": [
          {
            "description": "Mow lawn (Smith)",
            "amount": 60
          },
          {
            "type": "labor",
            "description": "Hedge trim (Lee)",
            "quantity": 2,
            "unitPrice": 45,
            "amount": 90
          }
        ],
        "expectViolations": false,
        "qualityGateStatus": "pass",
        "subtotal": 150
      },
      {
        "label": "blended",
        "lineItems": [
          {
            "description": "Mow lawn and hedge",
            "amount": 150
          }
        ],
        "expectViolations": true,
        "expectedViolationIds": [
          "deterministic_arithmetic_only"
        ],
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "needsFollowUp": false
      }
    ]
  },
  {
    "id": "GC-026",
    "category": "multiple_jobs",
    "title": "Second job missing price does not zero first job",
    "messyInput": "Client Riviera: pressure wash $180. Client Oak St: deck stain, price TBD.",
    "expectedFacts": [
      {
        "subject": "pressure wash",
        "kind": "labor",
        "field": "amount",
        "state": "known",
        "value": 180
      },
      {
        "subject": "deck stain",
        "kind": "labor",
        "field": "price",
        "state": "unresolved"
      }
    ],
    "expectedUnresolved": [
      {
        "subject": "deck stain",
        "field": "price",
        "reason": "price TBD"
      }
    ],
    "expectedLineHints": [
      {
        "descriptionMatch": "pressure|wash",
        "amount": 180
      },
      {
        "descriptionMatch": "deck|stain",
        "amountMustBeAbsent": true
      }
    ],
    "invariants": [
      "unknown_price_not_zero",
      "no_evidence_no_invented_money",
      "unresolved_facts_visible",
      "blockers_prevent_silent_finalization",
      "deterministic_arithmetic_only"
    ],
    "rationale": "Unresolved job B must not pollute job A pricing.",
    "candidates": [
      {
        "label": "zero-both",
        "lineItems": [
          {
            "description": "Pressure wash",
            "amount": 0
          },
          {
            "description": "Deck stain",
            "amount": 0
          }
        ],
        "expectViolations": true,
        "expectedViolationIds": [
          "unknown_price_not_zero",
          "no_evidence_no_invented_money"
        ],
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "needsFollowUp": false
      },
      {
        "label": "A-ok-B-open",
        "lineItems": [
          {
            "description": "Pressure wash",
            "amount": 180
          },
          {
            "description": "Deck stain"
          }
        ],
        "expectViolations": false,
        "openDecisions": [
          {
            "prompt": "Confirm price for deck stain?",
            "fieldHint": "price",
            "subjectHint": "deck stain"
          }
        ],
        "qualityGateStatus": "needs_review",
        "needsFollowUp": true
      }
    ]
  },
  {
    "id": "GC-027",
    "category": "voice_transcription",
    "title": "Voice-like 'for tea dollars' must not invent $2",
    "messyInput": "Replaced valve for tea dollars... I mean forty dollars. Labor one hour at ninety.",
    "expectedFacts": [
      {
        "subject": "valve",
        "kind": "material",
        "field": "amount",
        "state": "known",
        "value": 40
      },
      {
        "subject": "labor",
        "kind": "labor",
        "field": "amount",
        "state": "known",
        "value": 90
      }
    ],
    "expectedUnresolved": [],
    "expectedLineHints": [
      {
        "descriptionMatch": "valve",
        "amount": 40
      },
      {
        "descriptionMatch": "labor|hour",
        "amount": 90
      }
    ],
    "invariants": [
      "deterministic_arithmetic_only",
      "no_evidence_no_invented_money",
      "unresolved_facts_visible"
    ],
    "rationale": "ASR error corrected in-note; final explicit amount wins.",
    "candidates": [
      {
        "label": "corrected-40",
        "lineItems": [
          {
            "description": "Valve",
            "amount": 40
          },
          {
            "type": "labor",
            "description": "Labor",
            "quantity": 1,
            "unitPrice": 90,
            "amount": 90
          }
        ],
        "expectViolations": false,
        "qualityGateStatus": "pass",
        "subtotal": 130
      },
      {
        "label": "tea-as-2",
        "lineItems": [
          {
            "description": "Valve",
            "amount": 2
          },
          {
            "type": "labor",
            "description": "Labor",
            "quantity": 1,
            "unitPrice": 90,
            "amount": 90
          }
        ],
        "expectViolations": true,
        "expectedViolationIds": [
          "deterministic_arithmetic_only"
        ],
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "needsFollowUp": false
      }
    ]
  },
  {
    "id": "GC-028",
    "category": "voice_transcription",
    "title": "Homophone garbled hours stay unresolved",
    "messyInput": "Drywall patch our and a half at sixty an hour \u2014 wait, hours unclear in recording.",
    "expectedFacts": [
      {
        "subject": "drywall patch",
        "kind": "labor",
        "field": "hours",
        "state": "unresolved"
      },
      {
        "subject": "drywall patch",
        "kind": "labor",
        "field": "rate",
        "state": "known",
        "value": 60
      }
    ],
    "expectedUnresolved": [
      {
        "subject": "drywall patch",
        "field": "hours",
        "reason": "voice garbled hours"
      }
    ],
    "expectedLineHints": [
      {
        "descriptionMatch": "drywall",
        "unitPrice": 60,
        "quantityMustBeAbsent": true,
        "amountMustBeAbsent": true
      }
    ],
    "invariants": [
      "unresolved_facts_visible",
      "blockers_prevent_silent_finalization",
      "no_evidence_no_invented_money"
    ],
    "rationale": "Garbled duration must not invent 1.5h silently.",
    "candidates": [
      {
        "label": "assumed-1-5",
        "lineItems": [
          {
            "type": "labor",
            "description": "Drywall patch",
            "quantity": 1.5,
            "unitPrice": 60,
            "amount": 90
          }
        ],
        "expectViolations": true,
        "expectedViolationIds": [
          "no_evidence_no_invented_money"
        ],
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "needsFollowUp": false
      },
      {
        "label": "ask-hours",
        "lineItems": [
          {
            "type": "labor",
            "description": "Drywall patch",
            "unitPrice": 60
          }
        ],
        "expectViolations": false,
        "openDecisions": [
          {
            "prompt": "Confirm hours for drywall patch?",
            "fieldHint": "hours",
            "subjectHint": "drywall patch"
          }
        ],
        "qualityGateStatus": "needs_review",
        "needsFollowUp": true
      }
    ]
  },
  {
    "id": "GC-029",
    "category": "contradictory_statements",
    "title": "Contradictory hours without correction cue",
    "messyInput": "Tile repair took 2 hours at $100/hr. Tile repair took 4 hours at $100/hr.",
    "expectedFacts": [
      {
        "subject": "tile repair",
        "kind": "labor",
        "field": "hours",
        "state": "unresolved"
      },
      {
        "subject": "tile repair",
        "kind": "labor",
        "field": "rate",
        "state": "known",
        "value": 100
      }
    ],
    "expectedUnresolved": [
      {
        "subject": "tile repair",
        "field": "hours",
        "reason": "contradictory 2h vs 4h"
      }
    ],
    "expectedLineHints": [
      {
        "descriptionMatch": "tile",
        "amountMustBeAbsent": true,
        "quantityMustBeAbsent": true
      }
    ],
    "invariants": [
      "unresolved_facts_visible",
      "blockers_prevent_silent_finalization",
      "no_evidence_no_invented_money",
      "deterministic_arithmetic_only"
    ],
    "rationale": "Contradiction without 'actually' cue must not pick a winner.",
    "candidates": [
      {
        "label": "picked-4",
        "lineItems": [
          {
            "type": "labor",
            "description": "Tile repair",
            "quantity": 4,
            "unitPrice": 100,
            "amount": 400
          }
        ],
        "expectViolations": true,
        "expectedViolationIds": [
          "no_evidence_no_invented_money"
        ],
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "needsFollowUp": false
      },
      {
        "label": "contradiction-open",
        "lineItems": [
          {
            "type": "labor",
            "description": "Tile repair",
            "unitPrice": 100
          }
        ],
        "expectViolations": false,
        "openDecisions": [
          {
            "prompt": "Confirm hours for tile repair (2 vs 4)?",
            "fieldHint": "hours",
            "subjectHint": "tile repair"
          }
        ],
        "qualityGateStatus": "needs_review",
        "needsFollowUp": true
      }
    ]
  },
  {
    "id": "GC-030",
    "category": "contradictory_statements",
    "title": "Free then charged contradiction stays open",
    "messyInput": "Diagnostic visit no charge. Diagnostic visit $75.",
    "expectedFacts": [
      {
        "subject": "diagnostic visit",
        "kind": "labor",
        "field": "amount",
        "state": "unresolved"
      }
    ],
    "expectedUnresolved": [
      {
        "subject": "diagnostic visit",
        "field": "amount",
        "reason": "no charge vs $75 contradiction"
      }
    ],
    "expectedLineHints": [
      {
        "descriptionMatch": "diagnostic",
        "amountMustBeAbsent": true
      }
    ],
    "invariants": [
      "free_is_subject_bound",
      "unknown_price_not_zero",
      "no_evidence_no_invented_money",
      "deterministic_arithmetic_only",
      "unresolved_facts_visible",
      "blockers_prevent_silent_finalization"
    ],
    "rationale": "Contradictory waive vs charge must surface a decision.",
    "candidates": [
      {
        "label": "picked-free",
        "lineItems": [
          {
            "description": "Diagnostic visit",
            "amount": 0
          }
        ],
        "expectViolations": true,
        "expectedViolationIds": [
          "unresolved_facts_visible",
          "blockers_prevent_silent_finalization"
        ],
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "needsFollowUp": false
      },
      {
        "label": "picked-75",
        "lineItems": [
          {
            "description": "Diagnostic visit",
            "amount": 75
          }
        ],
        "expectViolations": true,
        "expectedViolationIds": [
          "unresolved_facts_visible",
          "blockers_prevent_silent_finalization"
        ],
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "needsFollowUp": false
      },
      {
        "label": "ask",
        "lineItems": [
          {
            "description": "Diagnostic visit"
          }
        ],
        "expectViolations": false,
        "openDecisions": [
          {
            "prompt": "Is diagnostic visit free or $75?",
            "fieldHint": "amount",
            "subjectHint": "diagnostic visit"
          }
        ],
        "qualityGateStatus": "needs_review",
        "needsFollowUp": true
      }
    ]
  },
  {
    "id": "GC-031",
    "category": "decimal_hours_currency",
    "title": "Decimal hours and currency formatting",
    "messyInput": "Service call 1.25 hours at $88/hr. Parking $4.50.",
    "expectedFacts": [
      {
        "subject": "service call",
        "kind": "labor",
        "field": "amount",
        "state": "known",
        "value": 110
      },
      {
        "subject": "parking",
        "kind": "material",
        "field": "amount",
        "state": "known",
        "value": 4.5
      }
    ],
    "expectedUnresolved": [],
    "expectedLineHints": [
      {
        "descriptionMatch": "service",
        "quantity": 1.25,
        "unitPrice": 88,
        "amount": 110
      },
      {
        "descriptionMatch": "parking",
        "amount": 4.5
      }
    ],
    "invariants": [
      "deterministic_arithmetic_only",
      "no_evidence_no_invented_money"
    ],
    "rationale": "1.25*88=110; keep $4.50 exact.",
    "candidates": [
      {
        "label": "exact",
        "lineItems": [
          {
            "type": "labor",
            "description": "Service call",
            "quantity": 1.25,
            "unitPrice": 88,
            "amount": 110
          },
          {
            "description": "Parking",
            "amount": 4.5
          }
        ],
        "expectViolations": false,
        "qualityGateStatus": "pass",
        "subtotal": 114.5
      },
      {
        "label": "rounded-hours",
        "lineItems": [
          {
            "type": "labor",
            "description": "Service call",
            "quantity": 1,
            "unitPrice": 88,
            "amount": 88
          },
          {
            "description": "Parking",
            "amount": 4.5
          }
        ],
        "expectViolations": true,
        "expectedViolationIds": [
          "deterministic_arithmetic_only"
        ],
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "needsFollowUp": false
      }
    ]
  },
  {
    "id": "GC-032",
    "category": "decimal_hours_currency",
    "title": "Currency with commas must parse deterministically",
    "messyInput": "Equipment rental $1,250.00 for the week.",
    "expectedFacts": [
      {
        "subject": "equipment rental",
        "kind": "material",
        "field": "amount",
        "state": "known",
        "value": 1250
      }
    ],
    "expectedUnresolved": [],
    "expectedLineHints": [
      {
        "descriptionMatch": "equipment|rental",
        "amount": 1250
      }
    ],
    "invariants": [
      "deterministic_arithmetic_only",
      "no_evidence_no_invented_money"
    ],
    "rationale": "Comma formatting must not become 1.25.",
    "candidates": [
      {
        "label": "1250",
        "lineItems": [
          {
            "description": "Equipment rental",
            "amount": 1250
          }
        ],
        "expectViolations": false,
        "qualityGateStatus": "pass"
      },
      {
        "label": "parsed-1-25",
        "lineItems": [
          {
            "description": "Equipment rental",
            "amount": 1.25
          }
        ],
        "expectViolations": true,
        "expectedViolationIds": [
          "deterministic_arithmetic_only"
        ],
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "needsFollowUp": false
      }
    ]
  },
  {
    "id": "GC-033",
    "category": "discounts_credits",
    "title": "Explicit discount amount applies",
    "messyInput": "Sink leak repair 2h @ $95/hr and please add a $20 discount for delay.",
    "expectedFacts": [
      {
        "subject": "sink leak repair",
        "kind": "labor",
        "field": "amount",
        "state": "known",
        "value": 190
      },
      {
        "subject": "discount",
        "kind": "discount",
        "field": "discount",
        "state": "known",
        "value": 20
      }
    ],
    "expectedUnresolved": [],
    "expectedLineHints": [
      {
        "descriptionMatch": "sink|leak",
        "amount": 190
      }
    ],
    "invariants": [
      "deterministic_arithmetic_only",
      "no_evidence_no_invented_money"
    ],
    "rationale": "Explicit $20 discount is deterministic.",
    "candidates": [
      {
        "label": "discount-20",
        "lineItems": [
          {
            "type": "labor",
            "description": "Sink leak repair",
            "quantity": 2,
            "unitPrice": 95,
            "amount": 190
          }
        ],
        "expectViolations": false,
        "discountAmount": 20,
        "subtotal": 190,
        "total": 170,
        "qualityGateStatus": "pass"
      },
      {
        "label": "wrong-discount",
        "lineItems": [
          {
            "type": "labor",
            "description": "Sink leak repair",
            "quantity": 2,
            "unitPrice": 95,
            "amount": 190
          }
        ],
        "expectViolations": true,
        "expectedViolationIds": [
          "deterministic_arithmetic_only"
        ],
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "needsFollowUp": false,
        "discountAmount": 50,
        "subtotal": 190,
        "total": 140
      }
    ]
  },
  {
    "id": "GC-034",
    "category": "discounts_credits",
    "title": "Discount mentioned without amount stays open",
    "messyInput": "Fixed sink leak 2h @ $95/hr and apply a discount for delay.",
    "expectedFacts": [
      {
        "subject": "sink leak",
        "kind": "labor",
        "field": "amount",
        "state": "known",
        "value": 190
      },
      {
        "subject": "discount",
        "kind": "discount",
        "field": "discount",
        "state": "unresolved"
      }
    ],
    "expectedUnresolved": [
      {
        "subject": "discount",
        "field": "discount",
        "reason": "amount missing"
      }
    ],
    "expectedLineHints": [
      {
        "descriptionMatch": "sink",
        "amount": 190
      }
    ],
    "invariants": [
      "unresolved_facts_visible",
      "blockers_prevent_silent_finalization",
      "no_evidence_no_invented_money",
      "deterministic_arithmetic_only"
    ],
    "rationale": "Missing discount amount must not invent a percentage.",
    "candidates": [
      {
        "label": "invented-10pct",
        "lineItems": [
          {
            "type": "labor",
            "description": "Fixed sink leak",
            "quantity": 2,
            "unitPrice": 95,
            "amount": 190
          }
        ],
        "expectViolations": true,
        "expectedViolationIds": [
          "unresolved_facts_visible",
          "blockers_prevent_silent_finalization"
        ],
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "needsFollowUp": false,
        "discountAmount": 19
      },
      {
        "label": "ask-discount",
        "lineItems": [
          {
            "type": "labor",
            "description": "Fixed sink leak",
            "quantity": 2,
            "unitPrice": 95,
            "amount": 190
          }
        ],
        "expectViolations": false,
        "discountAmount": 0,
        "openDecisions": [
          {
            "prompt": "What discount amount for delay?",
            "fieldHint": "discount",
            "subjectHint": "discount"
          }
        ],
        "qualityGateStatus": "needs_review",
        "needsFollowUp": true
      }
    ]
  },
  {
    "id": "GC-035",
    "category": "descriptive_non_billable",
    "title": "Intentionally descriptive non-billable work",
    "messyInput": "Noted mildew in corner for homeowner awareness \u2014 not billing that. Cleaned drains 1h @ $75/hr.",
    "expectedFacts": [
      {
        "subject": "mildew note",
        "kind": "note",
        "state": "waived",
        "note": "non-billable observation"
      },
      {
        "subject": "cleaned drains",
        "kind": "labor",
        "field": "amount",
        "state": "known",
        "value": 75
      }
    ],
    "expectedUnresolved": [],
    "expectedLineHints": [
      {
        "descriptionMatch": "drain",
        "amount": 75
      }
    ],
    "invariants": [
      "no_evidence_no_invented_money",
      "free_is_subject_bound",
      "deterministic_arithmetic_only"
    ],
    "rationale": "Descriptive non-billable text must not become a priced line.",
    "candidates": [
      {
        "label": "note-excluded",
        "lineItems": [
          {
            "type": "labor",
            "description": "Cleaned drains",
            "quantity": 1,
            "unitPrice": 75,
            "amount": 75
          }
        ],
        "expectViolations": false,
        "qualityGateStatus": "pass",
        "subtotal": 75
      },
      {
        "label": "mildew-billed",
        "lineItems": [
          {
            "description": "Mildew observation",
            "amount": 40
          },
          {
            "type": "labor",
            "description": "Cleaned drains",
            "quantity": 1,
            "unitPrice": 75,
            "amount": 75
          }
        ],
        "expectViolations": true,
        "expectedViolationIds": [
          "no_evidence_no_invented_money"
        ],
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "needsFollowUp": false
      }
    ]
  },
  {
    "id": "GC-036",
    "category": "descriptive_non_billable",
    "title": "Up to you if bill stays a decision",
    "messyInput": "Cabinet door adjustment maybe 20 mins, up to you if bill. Faucet repair 2h @ $80/hr.",
    "expectedFacts": [
      {
        "subject": "cabinet door adjustment",
        "kind": "labor",
        "field": "amount",
        "state": "unresolved"
      },
      {
        "subject": "faucet repair",
        "kind": "labor",
        "field": "amount",
        "state": "known",
        "value": 160
      }
    ],
    "expectedUnresolved": [
      {
        "subject": "cabinet door adjustment",
        "field": "amount",
        "reason": "up to you if bill"
      }
    ],
    "expectedLineHints": [
      {
        "descriptionMatch": "cabinet",
        "amountMustBeAbsent": true
      },
      {
        "descriptionMatch": "faucet",
        "amount": 160
      }
    ],
    "invariants": [
      "unresolved_facts_visible",
      "blockers_prevent_silent_finalization",
      "no_evidence_no_invented_money",
      "deterministic_arithmetic_only"
    ],
    "rationale": "Operator choice language must remain an open billing decision.",
    "candidates": [
      {
        "label": "auto-billed-cabinet",
        "lineItems": [
          {
            "type": "labor",
            "description": "Cabinet door adjustment",
            "quantity": 0.33,
            "unitPrice": 80,
            "amount": 26.4
          },
          {
            "type": "labor",
            "description": "Faucet repair",
            "quantity": 2,
            "unitPrice": 80,
            "amount": 160
          }
        ],
        "expectViolations": true,
        "expectedViolationIds": [
          "no_evidence_no_invented_money"
        ],
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "needsFollowUp": false
      },
      {
        "label": "cabinet-decision",
        "lineItems": [
          {
            "type": "labor",
            "description": "Cabinet door adjustment"
          },
          {
            "type": "labor",
            "description": "Faucet repair",
            "quantity": 2,
            "unitPrice": 80,
            "amount": 160
          }
        ],
        "expectViolations": false,
        "openDecisions": [
          {
            "prompt": "Bill cabinet door adjustment?",
            "fieldHint": "amount",
            "subjectHint": "cabinet door adjustment"
          }
        ],
        "qualityGateStatus": "needs_review",
        "needsFollowUp": true
      }
    ]
  },
  {
    "id": "GC-037",
    "category": "money_safety_combo",
    "title": "Originating missing-price statement cannot self-resolve (AG-088)",
    "messyInput": "Add 1 acid jug but price unknown",
    "expectedFacts": [
      {
        "subject": "acid jug",
        "kind": "material",
        "field": "price",
        "state": "unresolved"
      },
      {
        "subject": "acid jug",
        "kind": "material",
        "field": "quantity",
        "state": "known",
        "value": 1
      }
    ],
    "expectedUnresolved": [
      {
        "subject": "acid jug",
        "field": "price",
        "reason": "price unknown"
      }
    ],
    "expectedLineHints": [
      {
        "descriptionMatch": "acid",
        "quantity": 1,
        "amountMustBeAbsent": true,
        "unitPriceMustBeAbsent": true
      }
    ],
    "invariants": [
      "unknown_price_not_zero",
      "no_evidence_no_invented_money",
      "unresolved_facts_visible",
      "blockers_prevent_silent_finalization",
      "deterministic_arithmetic_only"
    ],
    "rationale": "Same statement cannot both mark missing and invent a price.",
    "relatedAG": [
      "AG-088",
      "AG-094"
    ],
    "candidates": [
      {
        "label": "self-resolved-zero",
        "lineItems": [
          {
            "description": "Acid jug",
            "quantity": 1,
            "unitPrice": 0,
            "amount": 0
          }
        ],
        "expectViolations": true,
        "expectedViolationIds": [
          "unknown_price_not_zero"
        ],
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "needsFollowUp": false
      },
      {
        "label": "still-open",
        "lineItems": [
          {
            "description": "Acid jug",
            "quantity": 1
          }
        ],
        "expectViolations": false,
        "openDecisions": [
          {
            "prompt": "Confirm unit price for \"Acid jug\"?",
            "fieldHint": "price",
            "subjectHint": "acid jug"
          }
        ],
        "qualityGateStatus": "needs_review",
        "needsFollowUp": true
      }
    ]
  },
  {
    "id": "GC-038",
    "category": "money_safety_combo",
    "title": "Equipment replacement exact amounts unchanged (AG-082)",
    "messyInput": "Replaced circulation pump $842.50 and installed new relay $63.00. Labor 3h @ $95/hr.",
    "expectedFacts": [
      {
        "subject": "circulation pump",
        "kind": "material",
        "field": "amount",
        "state": "known",
        "value": 842.5
      },
      {
        "subject": "relay",
        "kind": "material",
        "field": "amount",
        "state": "known",
        "value": 63
      },
      {
        "subject": "labor",
        "kind": "labor",
        "field": "amount",
        "state": "known",
        "value": 285
      }
    ],
    "expectedUnresolved": [],
    "expectedLineHints": [
      {
        "descriptionMatch": "pump",
        "amount": 842.5
      },
      {
        "descriptionMatch": "relay",
        "amount": 63
      },
      {
        "descriptionMatch": "labor|install",
        "amount": 285
      }
    ],
    "invariants": [
      "deterministic_arithmetic_only",
      "no_evidence_no_invented_money"
    ],
    "rationale": "Exact numeric evidence must pass through unchanged.",
    "relatedAG": [
      "AG-082"
    ],
    "candidates": [
      {
        "label": "exact",
        "lineItems": [
          {
            "description": "Circulation pump",
            "amount": 842.5
          },
          {
            "description": "Relay",
            "amount": 63
          },
          {
            "type": "labor",
            "description": "Install labor",
            "quantity": 3,
            "unitPrice": 95,
            "amount": 285
          }
        ],
        "expectViolations": false,
        "qualityGateStatus": "pass",
        "subtotal": 1190.5
      },
      {
        "label": "rounded-pump",
        "lineItems": [
          {
            "description": "Circulation pump",
            "amount": 843
          },
          {
            "description": "Relay",
            "amount": 63
          },
          {
            "type": "labor",
            "description": "Install labor",
            "quantity": 3,
            "unitPrice": 95,
            "amount": 285
          }
        ],
        "expectViolations": true,
        "expectedViolationIds": [
          "deterministic_arithmetic_only"
        ],
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "needsFollowUp": false
      }
    ]
  },
  {
    "id": "GC-039",
    "category": "missing_price",
    "title": "Material cost unknown with known qty",
    "messyInput": "Used 2 bags of polymer sand \u2014 cost not available yet. Labor edging 1h @ $70/hr.",
    "expectedFacts": [
      {
        "subject": "polymer sand",
        "kind": "material",
        "field": "quantity",
        "state": "known",
        "value": 2
      },
      {
        "subject": "polymer sand",
        "kind": "material",
        "field": "cost",
        "state": "unresolved"
      },
      {
        "subject": "edging",
        "kind": "labor",
        "field": "amount",
        "state": "known",
        "value": 70
      }
    ],
    "expectedUnresolved": [
      {
        "subject": "polymer sand",
        "field": "cost",
        "reason": "cost not available"
      }
    ],
    "expectedLineHints": [
      {
        "descriptionMatch": "polymer|sand",
        "quantity": 2,
        "amountMustBeAbsent": true,
        "unitPriceMustBeAbsent": true
      },
      {
        "descriptionMatch": "edging|labor",
        "amount": 70
      }
    ],
    "invariants": [
      "unknown_price_not_zero",
      "no_evidence_no_invented_money",
      "unresolved_facts_visible",
      "blockers_prevent_silent_finalization",
      "deterministic_arithmetic_only"
    ],
    "rationale": "Known qty + unknown cost must not invent unit cost.",
    "candidates": [
      {
        "label": "invented-sand-price",
        "lineItems": [
          {
            "description": "Polymer sand",
            "quantity": 2,
            "unitPrice": 25,
            "amount": 50
          },
          {
            "type": "labor",
            "description": "Edging labor",
            "quantity": 1,
            "unitPrice": 70,
            "amount": 70
          }
        ],
        "expectViolations": true,
        "expectedViolationIds": [
          "no_evidence_no_invented_money"
        ],
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "needsFollowUp": false
      },
      {
        "label": "sand-open",
        "lineItems": [
          {
            "description": "Polymer sand",
            "quantity": 2
          },
          {
            "type": "labor",
            "description": "Edging labor",
            "quantity": 1,
            "unitPrice": 70,
            "amount": 70
          }
        ],
        "expectViolations": false,
        "openDecisions": [
          {
            "prompt": "Confirm cost for \"Polymer sand\"?",
            "fieldHint": "cost",
            "subjectHint": "polymer sand"
          }
        ],
        "qualityGateStatus": "needs_review",
        "needsFollowUp": true
      }
    ]
  },
  {
    "id": "GC-040",
    "category": "later_correction",
    "title": "Later evidence resolves only matching subject",
    "messyInput": "Added chlorine tablets quantity unknown. Added bromine tablets quantity unknown. Chlorine tablets quantity is 3.",
    "expectedFacts": [
      {
        "subject": "chlorine tablets",
        "kind": "material",
        "field": "quantity",
        "state": "known",
        "value": 3
      },
      {
        "subject": "bromine tablets",
        "kind": "material",
        "field": "quantity",
        "state": "unresolved"
      }
    ],
    "expectedUnresolved": [
      {
        "subject": "bromine tablets",
        "field": "quantity",
        "reason": "still unknown"
      }
    ],
    "expectedLineHints": [
      {
        "descriptionMatch": "chlorine",
        "quantity": 3
      },
      {
        "descriptionMatch": "bromine",
        "quantityMustBeAbsent": true
      }
    ],
    "invariants": [
      "later_evidence_field_scoped",
      "unresolved_facts_visible",
      "blockers_prevent_silent_finalization",
      "unknown_quantity_not_one",
      "deterministic_arithmetic_only"
    ],
    "rationale": "Correction binds only chlorine; bromine stays unresolved.",
    "relatedAG": [
      "AG-094"
    ],
    "candidates": [
      {
        "label": "both-set-to-3",
        "lineItems": [
          {
            "description": "Chlorine tablets",
            "quantity": 3
          },
          {
            "description": "Bromine tablets",
            "quantity": 3
          }
        ],
        "expectViolations": true,
        "expectedViolationIds": [
          "later_evidence_field_scoped",
          "unresolved_facts_visible"
        ],
        "qualityGateStatus": "pass",
        "openDecisions": [],
        "needsFollowUp": false
      },
      {
        "label": "scoped-resolve",
        "lineItems": [
          {
            "description": "Chlorine tablets",
            "quantity": 3
          },
          {
            "description": "Bromine tablets"
          }
        ],
        "expectViolations": false,
        "openDecisions": [
          {
            "prompt": "Confirm quantity for \"Bromine tablets\"?",
            "fieldHint": "quantity",
            "subjectHint": "bromine tablets"
          }
        ],
        "qualityGateStatus": "needs_review",
        "needsFollowUp": true
      }
    ]
  }
] as GoldenCase[];

export const GOLDEN_CASE_COUNT = GOLDEN_CASES.length;
