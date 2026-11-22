import React, { useCallback, useEffect, useState } from 'react';
import { useLocalization } from '../context/LocalizationContext';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../lib/apiBase';

interface VersionPlanModalProps {
  onClose: () => void;
  title: string;
}

type PaidPlanId = 'plus' | 'pro';
type ModalPage = 'overview' | 'current' | 'upgrade';
type GenerationBalance = {
  currentPlan: 'free' | PaidPlanId;
  quotaPlan: 'free' | PaidPlanId;
  remainingGenerations: number;
};
type PaymentPlanSummary = {
  id: PaidPlanId;
  amountCny: number;
  credits: number;
  enabled: boolean;
};

type PaymentOrder = {
  id: string;
  planName: string;
  amountCny: number;
  credits: number;
  paymentUrl: string;
  instructions: string;
  provider: 'manual' | 'wechat_native' | 'alipay_page';
};

const ICON_STROKE_WIDTH = 1.6;

const IconChevronLeft: React.FC = () => (
  <svg
    width="17"
    height="17"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={ICON_STROKE_WIDTH}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="m15 18-6-6 6-6" />
  </svg>
);

const IconChevronRight: React.FC = () => (
  <svg
    width="17"
    height="17"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={ICON_STROKE_WIDTH}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="m9 18 6-6-6-6" />
  </svg>
);

export const VersionPlanModal: React.FC<VersionPlanModalProps> = ({ onClose, title }) => {
  const { t } = useLocalization();
  const { session, user } = useAuth();
  const [page, setPage] = useState<ModalPage>('overview');
  const [balance, setBalance] = useState<GenerationBalance | null>(null);
  const [paymentPlans, setPaymentPlans] = useState<PaymentPlanSummary[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<PaidPlanId | null>(null);
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshBalance = useCallback(async () => {
    if (!user || !session?.access_token) return null;
    try {
      const response = await fetch(apiUrl('/api/generation-quota'), {
        method: 'GET',
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });
      const data = (await response.json().catch(() => ({}))) as {
        balance?: GenerationBalance;
      };
      if (data.balance) {
        setBalance(data.balance);
        return data.balance;
      }
    } catch {
      // Keep the last known balance visible if the network is temporarily unavailable.
    }
    return null;
  }, [session?.access_token, user]);

  useEffect(() => {
    void refreshBalance();
    const refreshOnFocus = () => {
      if (document.visibilityState === 'visible') void refreshBalance();
    };
    window.addEventListener('focus', refreshOnFocus);
    window.addEventListener('echomap:generation-completed', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnFocus);
    return () => {
      window.removeEventListener('focus', refreshOnFocus);
      window.removeEventListener('echomap:generation-completed', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshOnFocus);
    };
  }, [refreshBalance]);

  useEffect(() => {
    if (page !== 'upgrade') return;
    let cancelled = false;
    setPlansLoading(true);
    void fetch(apiUrl('/api/payments/create-order'), { method: 'GET', cache: 'no-store' })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as { plans?: PaymentPlanSummary[] };
        if (!cancelled) {
          setPaymentPlans(
            response.ok && Array.isArray(data.plans)
              ? data.plans.filter(
                  (plan) =>
                    (plan.id === 'plus' || plan.id === 'pro') &&
                    Number.isFinite(plan.amountCny) &&
                    Number.isFinite(plan.credits) &&
                    typeof plan.enabled === 'boolean',
                )
              : [],
          );
        }
      })
      .catch(() => {
        if (!cancelled) setPaymentPlans([]);
      })
      .finally(() => {
        if (!cancelled) setPlansLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page]);

  const createOrder = async (planId: PaidPlanId, paymentWindow: Window | null) => {
    setError(null);
    setOrder(null);
    if (!session?.access_token || !user) {
      paymentWindow?.close();
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
      const data = (await response.json().catch(() => ({}))) as {
        order?: PaymentOrder;
        paymentFormHtml?: string;
        error?: string;
      };
      if (!response.ok || !data.order) {
        throw new Error(data.error || `Unable to create order (${response.status})`);
      }
      if (data.paymentFormHtml) {
        if (!paymentWindow) throw new Error('浏览器拦截了支付窗口，请允许弹出窗口后重试。');
        try {
          try {
            paymentWindow.opener = null;
          } catch {
            // The browser may make opener immutable for a newly opened tab.
          }
          paymentWindow.document.open();
          paymentWindow.document.write(data.paymentFormHtml);
          paymentWindow.document.close();
        } catch {
          throw new Error('无法打开支付宝收银台，请重试。');
        }
      } else {
        paymentWindow?.close();
      }
      setOrder(data.order);
      const startingBalance = balance?.remainingGenerations;
      if (startingBalance != null) {
        void (async () => {
          for (let attempt = 0; attempt < 20; attempt += 1) {
            await new Promise((resolve) => window.setTimeout(resolve, 15_000));
            const refreshed = await refreshBalance();
            if (
              refreshed &&
              refreshed.currentPlan === planId &&
              refreshed.remainingGenerations > startingBalance
            ) {
              break;
            }
          }
        })();
      }
    } catch (err) {
      paymentWindow?.close();
      const message = err instanceof Error ? err.message : '';
      setError(message.includes('payment plan is not available') ? '支付链接还没有配置，请稍后再试。' : message || '创建订单失败，请稍后再试。');
    } finally {
      setPendingPlan(null);
    }
  };

  const currentPlanId = balance?.currentPlan ?? 'free';
  const currentPlanName = t(
    currentPlanId === 'free'
      ? 'helpPlanFreeName'
      : currentPlanId === 'plus'
        ? 'helpPlanPlusName'
        : 'helpPlanProName',
  );
  const heading =
    page === 'overview'
      ? title
      : page === 'current'
        ? t('balanceCurrentPlan')
        : t('balanceUpgradePlan');

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="flex max-h-[82vh] flex-col gap-4 overflow-y-auto border border-black bg-white p-5 font-mono text-[15px] text-[#666] shadow-lg"
        onClick={(event) => event.stopPropagation()}
        style={{ width: 'min(calc(100vw - 2rem), 420px)' }}
        data-map-ui="balance-modal"
      >
        <h3 className="m-0 text-center text-[22px] font-bold leading-tight text-[#5f5f5f]">{heading}</h3>

        {page === 'overview' && (
          <div className="space-y-2">
            <button
              type="button"
              className="flex min-h-14 w-full items-center gap-3 rounded-[8px] border border-gray-200 px-4 py-3 text-left hover:border-[#1687ff] hover:bg-[#c6ddff]/40"
              onClick={() => setPage('current')}
            >
              <span className="min-w-0 flex-1 font-bold text-[#444]">{t('balanceCurrentPlan')}</span>
              <span className="text-[#666]">{currentPlanName}</span>
              <span className="flex shrink-0 text-[#888]" aria-hidden>
                <IconChevronRight />
              </span>
            </button>
            <button
              type="button"
              className="flex min-h-14 w-full items-center gap-3 rounded-[8px] border border-gray-200 px-4 py-3 text-left hover:border-[#1687ff] hover:bg-[#c6ddff]/40"
              onClick={() => setPage('upgrade')}
            >
              <span className="min-w-0 flex-1 font-bold text-[#444]">{t('balanceUpgradePlan')}</span>
              <span className="flex shrink-0 text-[#888]" aria-hidden>
                <IconChevronRight />
              </span>
            </button>
          </div>
        )}

        {page === 'current' && (
          <div className="rounded-[8px] border border-gray-200 px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-bold text-[#333]">{currentPlanName}</span>
              <span className="text-[13px] text-[#555]">
                {balance
                  ? t('balanceGenerationsRemaining', { count: balance.remainingGenerations })
                  : '—'}
              </span>
            </div>
            <p className="mb-0 mt-2 text-[13px] leading-[1.45] text-[#666]">
              {currentPlanId === 'free'
                ? t('balancePlanFreeDetail')
                : t('balancePlanPurchasedDetail')}
            </p>
          </div>
        )}

        {page === 'upgrade' && (
          <div className="space-y-2">
            <button
              type="button"
              className="flex items-center gap-2 border-0 bg-transparent p-0 text-[12px] text-[#666] hover:text-[#0053D4]"
              onClick={() => setPage('overview')}
            >
              <IconChevronLeft />
              <span>{t('balanceUpgradePlan')}</span>
            </button>
            {plansLoading && <p className="m-0 text-[13px]">{t('balancePlansLoading')}</p>}
            {!plansLoading && paymentPlans.length === 0 && (
              <p className="m-0 text-[13px]">{t('balancePlansUnavailable')}</p>
            )}
            {paymentPlans.map((plan) => (
              <button
                type="button"
                key={plan.id}
                onClick={(event) => {
                  event.stopPropagation();
                  const paymentWindow = window.open('about:blank', '_blank');
                  void createOrder(plan.id, paymentWindow);
                }}
                disabled={!plan.enabled || pendingPlan === plan.id}
                className="block w-full rounded-[8px] border border-gray-200 px-4 py-3 text-left text-current transition-colors hover:border-[#1687ff] hover:bg-[#c6ddff]/65 focus-visible:border-[#1687ff] focus-visible:bg-[#c6ddff]/65 focus-visible:outline-none disabled:cursor-default disabled:opacity-60"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[15px] font-bold leading-5 text-[#333]">
                    {t(plan.id === 'plus' ? 'helpPlanPlusName' : 'helpPlanProName')}
                  </span>
                  <span className="shrink-0 text-[14px] font-bold leading-5 text-[#555]">¥{plan.amountCny}</span>
                </div>
                <p className="mb-0 mt-2 text-[13px] leading-[1.45] text-[#666]">
                  {t('balancePlanCredits', { count: plan.credits })} · {t('balanceOneTimePackage')}
                </p>
                {!plan.enabled && (
                  <p className="mb-0 mt-1 text-[12px] text-[#888]">{t('providerNotConfigured')}</p>
                )}
                {pendingPlan === plan.id && <p className="mb-0 mt-2 text-[13px] text-[#1687ff]">{t('authProcessing')}</p>}
              </button>
            ))}
          </div>
        )}

        {error && <div className="rounded-[6px] border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">{error}</div>}
        {order && (
          <div className="rounded-[8px] border border-[#1687ff]/30 bg-[#eef6ff] p-4 text-[13px] leading-[1.55] text-[#3f4f5f]">
            <div className="font-bold text-[#2d3c4a]">
              {order.provider === 'alipay_page' ? '支付宝网页支付' : '微信扫码支付'}
            </div>
            <div className="mt-1">订单号：{order.id}</div>
            <div>套餐：{order.planName} · ¥{order.amountCny} · {order.credits} 次生成额度</div>
            {order.provider === 'alipay_page' ? (
              <p className="mt-2">已在新窗口打开支付宝收银台。付款完成后返回页面核实订单，额度以服务端确认结果为准。</p>
            ) : (
              <>
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
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
