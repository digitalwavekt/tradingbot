const {
  ORDER_STATES,
  canTransition,
  assertTransition
} = require('../src/execution/orders/OrderStateMachine');

describe('OrderStateMachine', () => {
  test('allows production order submission path', () => {
    expect(canTransition(ORDER_STATES.INTENT_CREATED, ORDER_STATES.RISK_APPROVED)).toBe(true);
    expect(canTransition(ORDER_STATES.RISK_APPROVED, ORDER_STATES.SUBMITTING)).toBe(true);
    expect(canTransition(ORDER_STATES.SUBMITTING, ORDER_STATES.SUBMITTED)).toBe(true);
    expect(canTransition(ORDER_STATES.SUBMITTED, ORDER_STATES.FILLED)).toBe(true);
  });

  test('blocks invalid terminal transition', () => {
    expect(() => assertTransition(ORDER_STATES.FILLED, ORDER_STATES.SUBMITTING)).toThrow('Invalid order state transition');
  });
});
