const {
  ORDER_STATES,
  canTransition,
  assertTransition
} = require('../src/execution/orders/OrderStateMachine');

describe('OrderStateMachine', () => {
  test('allows production order submission path', () => {
    expect(canTransition(ORDER_STATES.INTENT_CREATED, ORDER_STATES.RISK_CHECK_PASSED)).toBe(true);
    expect(canTransition(ORDER_STATES.RISK_CHECK_PASSED, ORDER_STATES.APPROVED)).toBe(true);
    expect(canTransition(ORDER_STATES.APPROVED, ORDER_STATES.SENT_TO_BROKER)).toBe(true);
    expect(canTransition(ORDER_STATES.SENT_TO_BROKER, ORDER_STATES.FILLED)).toBe(true);
  });

  test('blocks invalid terminal transition', () => {
    expect(() => assertTransition(ORDER_STATES.FILLED, ORDER_STATES.APPROVED)).toThrow('Invalid order state transition');
  });
});
