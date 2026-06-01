export type DiamondWithdrawStatusEvent = {
  type: 'DIAMOND_WITHDRAW_STATUS';
  status: 'approved' | 'rejected';
  refId: string;
  amount: number;
  idrValue: number;
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
  notes?: string;
};

export type DiamondEvent = DiamondWithdrawStatusEvent;

type Handler = (e: DiamondEvent) => void;

const handlers: Handler[] = [];

export const diamondEventBus = {
  on(handler: Handler): void {
    if (!handlers.includes(handler)) handlers.push(handler);
  },
  off(handler: Handler): void {
    const i = handlers.indexOf(handler);
    if (i >= 0) handlers.splice(i, 1);
  },
  emit(event: DiamondEvent): void {
    handlers.forEach(h => {
      try { h(event); } catch {}
    });
  },
};
