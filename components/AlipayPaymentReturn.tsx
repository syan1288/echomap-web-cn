import React from 'react';
import { apiUrl } from '../lib/apiBase';
import { useAuth } from '../context/AuthContext';

type PaymentCheckResponse = {
  order?: {
    id: string;
    status: string;
    planName: string;
    credits: number;
  };
  providerStatus?: string;
  error?: string;
};

export const AlipayPaymentReturn: React.FC = () => {
  const { loading, session } = useAuth();
  const orderId = React.useMemo(
    () => new URLSearchParams(window.location.search).get('out_trade_no')?.trim() ?? '',
    [],
  );
  const [message, setMessage] = React.useState('正在向服务端核实订单状态…');
  const [confirmed, setConfirmed] = React.useState(false);
  const [checking, setChecking] = React.useState(false);
  const checkingRef = React.useRef(false);
  const pollTimerRef = React.useRef<number | null>(null);
  const pollStartedAtRef = React.useRef<number | null>(null);

  const checkStatus = React.useCallback(async () => {
    if (loading || checkingRef.current || !orderId || !session?.access_token) return;
    if (pollStartedAtRef.current === null) {
      pollStartedAtRef.current = Date.now();
    }
    checkingRef.current = true;
    setChecking(true);
    try {
      const response = await fetch(apiUrl('/api/payments/status'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ orderId }),
      });
      const data = (await response.json().catch(() => ({}))) as PaymentCheckResponse;
      if (!response.ok) throw new Error(data.error || '暂时无法核实订单，请稍后重试。');
      if (data.order?.status === 'confirmed') {
        setConfirmed(true);
        setMessage(`支付已确认，${data.order.planName}额度已开通。`);
      } else if (data.providerStatus === 'CLOSED') {
        setMessage('支付宝显示订单已关闭；额度未开通。');
      } else {
        setMessage('正在等待支付宝回执，系统会自动重试核实，通常无需手动操作。');
        if (
          pollStartedAtRef.current !== null &&
          Date.now() - pollStartedAtRef.current < 90_000 &&
          pollTimerRef.current === null
        ) {
          pollTimerRef.current = window.setTimeout(() => {
            pollTimerRef.current = null;
            void checkStatus();
          }, 3_000);
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '暂时无法核实订单，请稍后重试。');
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }, [loading, orderId, session?.access_token]);

  React.useEffect(() => {
    if (!loading && session?.access_token) void checkStatus();
    return () => {
      if (pollTimerRef.current !== null) {
        window.clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [checkStatus, loading, session?.access_token]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f7fb] px-5 text-[#172033]">
      <section className="w-full max-w-md rounded-2xl border border-[#dce5f0] bg-white p-7 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#55708f]">Echo Map · Payment</p>
        <h1 className="mt-3 text-xl font-semibold">
          {confirmed ? '支付完成' : '正在确认支付'}
        </h1>
        <p role="status" aria-live="polite" className="mt-3 text-sm leading-6 text-[#526176]">
          {loading
            ? '正在恢复登录状态…'
            : !session?.access_token
              ? '请先登录购买时使用的账号，再核实额度。'
              : !orderId
                ? '回跳地址缺少订单号，请从 Version 页面查看订单状态。'
                : message}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {session?.access_token && orderId && !confirmed && (
            <button
              type="button"
              onClick={() => void checkStatus()}
              disabled={checking || loading}
              className="rounded-lg bg-[#0053d4] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {checking ? '核实中…' : '重新核实'}
            </button>
          )}
          <a className="rounded-lg border border-[#dce5f0] px-4 py-2 text-sm font-medium" href="/">
            返回 Echo Map
          </a>
        </div>
        <p className="mt-5 text-xs leading-5 text-[#7a8798]">
          本页面不会依据支付宝回跳参数判断付款成功；额度仅在服务端核实支付宝交易后开通。
        </p>
      </section>
    </main>
  );
};
