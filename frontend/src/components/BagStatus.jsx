import { useShop } from '../state/ShopContext.jsx';
import { RequestError } from './RequestState.jsx';

export function BagStatus() {
  const { cartError, cartBusy, cartStatus, mergePending, retryCart, authStatus } = useShop();
  if (!cartError || authStatus !== 'ready') return null;
  return <RequestError message={cartError} onRetry={retryCart} busy={cartBusy || cartStatus === 'loading'}
    retryLabel={mergePending ? 'Retry combining bags' : 'Reload bag'} />;
}
