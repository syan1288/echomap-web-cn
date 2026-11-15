import React, { useMemo, useState } from 'react';
import { useLocalization } from '../context/LocalizationContext';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../lib/apiBase';

interface VersionPlanModalProps {
  onClose: () => void;
  title: string;
}

type PaidPlanId = 'plus' | 'pro';

type PaymentOrder = {
  id: string;
  planName: string;
  amountCny: number;
  credits: number;
  paymentUrl: string;
  instructions: string;
};

export const VersionPlanModal: React.FC<VersionPlanModalProps> = ({ onClose, title }) => {
  const { t } = useLocalization();
  const { session, user } = useAuth();
  const [pendingPlan, setPendingPlan] = useState<PaidPlanId | null>(null);
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [error, setError] = useState<string | null>(null);

  const planRows = useMemo(() => [
    { id: null, name: t('helpPlanFreeName'), price: t('helpPlanFreePrice'), detail: t('helpPlanFreeDetail') },
    { id: 'plus' as const, name: t('helpPlanPlusName'), price: t('helpPlanPlusPrice'), detail: t('helpPlanPlusDetail') },
    { id: 'pro' as const, name: t('helpPlanProName'), price: t('helpPlanProPrice'), detail: t('helpPlanProDetail') },
  ], [t]);

  const createOrder = async (planId: PaidPlanId) => {
    setError(null);
    setOrder(null);
    if (!session?.access_token || !user) {
      setError('请先登录后再购买额度。');
      return;
    }

    setPendingPlan(planId);
    try {
      const response = await fetch(apiUrl('/api/payments/create-order'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ planId, contact: user.email || user.phone || null }),
      });
      const data = (await response.json().catch(() => ({}))) as { order?: PaymentOrder; error?: string };
      if (!response.ok || !data.order) {
        throw new Error(data.error || `Unable to create order (${response.status})`);
      }
      setOrder(data.order);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setError(message.includes('payment plan is not available') ? '支付链接还没有配置，请稍后再试。' : message || '创建订单失败，请稍后再试。');
    } finally {
      setPendingPlan(null);
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="flex max-h-[82vh] flex-col gap-4 overflow-y-auto border border-black bg-white p-5 font-mono text-[15px] text-[#666] shadow-lg"
        onClick={(event) => event.stopPropagation()}
        style={{ width: 'min(calc(100vw - 2rem), 420px)' }}
      >
        <h3 className="m-0 text-center text-[22px] font-bold leading-tight text-[#5f5f5f]">{title}</h3>
        <div className="space-y-2">
          {planRows.map((plan) => (
            <button
              type="button"
              key={plan.name}
              onClick={(event) => {
                event.stopPropagation();
                if (plan.id) void createOrder(plan.id);
              }}
              disabled={!plan.id || pendingPlan === plan.id}
              className="block w-full rounded-[8px] border border-gray-200 px-4 py-3 text-left text-current transition-colors hover:border-[#1687ff] hover:bg-[#c6ddff]/65 focus-visible:border-[#1687ff] focus-visible:bg-[#c6ddff]/65 focus-visible:outline-none disabled:cursor-default disabled:opacity-70"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[15px] font-bold leading-5 text-[#333]">{plan.name}</span>
                <span className="shrink-0 text-[14px] font-bold leading-5 text-[#555]">{plan.price}</span>
              </div>
              <p className="mt-2 text-[14px] leading-[1.45] text-[#666]">{plan.detail}</p>
              {plan.id && pendingPlan === plan.id && <p className="mt-2 text-[13px] text-[#1687ff]">正在创建订单...</p>}
            </button>
          ))}
        </div>
        {error && <div className="rounded-[6px] border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">{error}</div>}
        {order && (
          <div className="rounded-[8px] border border-[#1687ff]/30 bg-[#eef6ff] p-4 text-[13px] leading-[1.55] text-[#3f4f5f]">
            <div className="font-bold text-[#2d3c4a]">微信扫码支付</div>
            <div className="mt-1">订单号：{order.id}</div>
            <div>套餐：{order.planName} · ¥{order.amountCny} · {order.credits} 次生成额度</div>
            <img
              src={order.paymentUrl}
              alt={`${order.planName} 微信支付收款码`}
              className="mt-3 block w-full rounded-[8px] border border-black/10 bg-white object-contain"
            />
            <p className="mt-2">支付后请保留订单号，人工确认后开通额度。</p>
            <button
              type="button"
              className="mt-2 rounded-[6px] bg-[#1687ff] px-3 py-2 text-[13px] font-bold text-white"
              onClick={(event) => {
                event.stopPropagation();
                window.open(order.paymentUrl, '_blank', 'noopener,noreferrer');
              }}
            >
              打开支付链接
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
