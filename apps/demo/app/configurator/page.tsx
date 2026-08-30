'use client';

import { useMemo, useState } from 'react';
import { DemoDeveloperPanel } from '../components/demo-developer-panel';
import { DemoHeader } from '../components/demo-header';
import { resetDemoDeveloperState } from '../components/developer-events';
import {
  configuratorFinishes,
  configuratorOptions,
  configuratorProducts,
  configuratorSizes,
} from '../demo-data';

const defaults = {
  product: 'focus-desk',
  size: '150',
  finish: 'ash',
  options: ['cable-tray'],
  quantity: 1,
};

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export default function ConfiguratorPage() {
  const [product, setProduct] = useState(defaults.product);
  const [size, setSize] = useState(defaults.size);
  const [finish, setFinish] = useState(defaults.finish);
  const [options, setOptions] = useState<string[]>(defaults.options);
  const [quantity, setQuantity] = useState(defaults.quantity);

  const selectedProduct = configuratorProducts.find((item) => item.id === product) ?? configuratorProducts[0];
  const selectedSize = configuratorSizes.find((item) => item.id === size) ?? configuratorSizes[0];
  const selectedFinish = configuratorFinishes.find((item) => item.id === finish) ?? configuratorFinishes[0];
  const total = useMemo(() => (
    selectedProduct.basePrice
    + selectedSize.price
    + selectedFinish.price
    + configuratorOptions.filter((option) => options.includes(option.id)).reduce((sum, option) => sum + option.price, 0)
  ) * quantity, [options, quantity, selectedFinish.price, selectedProduct.basePrice, selectedSize.price]);

  const toggleOption = (optionId: string) => {
    setOptions((current) => current.includes(optionId)
      ? current.filter((item) => item !== optionId)
      : [...current, optionId]);
  };

  const reset = () => {
    setProduct(defaults.product);
    setSize(defaults.size);
    setFinish(defaults.finish);
    setOptions(defaults.options);
    setQuantity(defaults.quantity);
    resetDemoDeveloperState();
  };

  return (
    <main className="demo-page configurator-demo">
      <DemoHeader current="configurator" productName="Forma Workshop" />
      <section className="demo-titlebar compact-titlebar">
        <div>
          <p className="eyebrow">Native configurator foundation</p>
          <h1>Build your working surface.</h1>
          <p>Every control updates the same visible configuration that native WebMCP tools will operate in Step 10.</p>
        </div>
        <button className="reset-button" type="button" onClick={reset}>Reset demo</button>
      </section>

      <section className="configurator-workspace">
        <div className="product-stage" style={{ '--finish': selectedFinish.swatch } as React.CSSProperties}>
          <div className="stage-meta"><span>LIVE CONFIGURATION</span><strong>{selectedProduct.name}</strong></div>
          <div className={`desk-visual size-${selectedSize.id}`} aria-label={`${selectedSize.label} ${selectedFinish.label} ${selectedProduct.name}`}>
            <div className="desk-top" />
            <div className="desk-leg left" /><div className="desk-leg right" />
            {options.includes('monitor-shelf') && <div className="monitor-shelf" />}
            {options.includes('drawer') && <div className="desk-drawer" />}
            {options.includes('cable-tray') && <div className="cable-tray" />}
          </div>
          <div className="configuration-summary">
            <span>{selectedSize.label}</span><span>{selectedFinish.label}</span><span>{options.length} options</span><span>Qty {quantity}</span>
          </div>
        </div>

        <form className="configuration-controls" onSubmit={(event) => event.preventDefault()}>
          <fieldset>
            <legend><span>01</span> Product</legend>
            <div className="segmented-options">
              {configuratorProducts.map((item) => (
                <label className={product === item.id ? 'selected' : ''} key={item.id}>
                  <input type="radio" name="product" value={item.id} checked={product === item.id} onChange={() => setProduct(item.id)} />
                  <strong>{item.name}</strong><small>from {currency.format(item.basePrice)}</small>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend><span>02</span> Size</legend>
            <div className="choice-row">
              {configuratorSizes.map((item) => (
                <label className={size === item.id ? 'selected' : ''} key={item.id}>
                  <input type="radio" name="size" value={item.id} checked={size === item.id} onChange={() => setSize(item.id)} />
                  {item.label}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend><span>03</span> Finish</legend>
            <div className="finish-row">
              {configuratorFinishes.map((item) => (
                <label className={finish === item.id ? 'selected' : ''} key={item.id}>
                  <input type="radio" name="finish" value={item.id} checked={finish === item.id} onChange={() => setFinish(item.id)} />
                  <span style={{ background: item.swatch }} />{item.label}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend><span>04</span> Add-ons</legend>
            <div className="option-list">
              {configuratorOptions.map((item) => (
                <label key={item.id}>
                  <input type="checkbox" checked={options.includes(item.id)} onChange={() => toggleOption(item.id)} />
                  <span><strong>{item.label}</strong><small>+{currency.format(item.price)}</small></span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="quantity-total">
            <label>Quantity
              <input type="number" min="1" max="8" value={quantity} onChange={(event) => setQuantity(Math.max(1, Math.min(8, Number(event.target.value) || 1)))} />
            </label>
            <div><span>Configuration total</span><strong>{currency.format(total)}</strong></div>
          </div>
        </form>
      </section>
      <DemoDeveloperPanel />
    </main>
  );
}
