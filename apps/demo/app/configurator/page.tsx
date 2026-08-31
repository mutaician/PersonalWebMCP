'use client';

import { useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { DemoDeveloperPanel } from '../components/demo-developer-panel';
import { resetDemoDeveloperState } from '../components/developer-events';
import {
  configuratorFinishes,
  configuratorOptions,
  configuratorProducts,
  configuratorSizes,
} from '../demo-data';
import { useConfiguratorWebMcp } from './use-configurator-webmcp';

const defaults = {
  product: 'focus-desk',
  size: '150',
  finish: 'ash',
  options: ['cable-tray'],
  quantity: 1,
  angle: -18,
};

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export default function ConfiguratorPage() {
  const [product, setProduct] = useState(defaults.product);
  const [size, setSize] = useState(defaults.size);
  const [finish, setFinish] = useState(defaults.finish);
  const [options, setOptions] = useState<string[]>(defaults.options);
  const [quantity, setQuantity] = useState(defaults.quantity);
  const [angle, setAngle] = useState(defaults.angle);
  const [notice, setNotice] = useState('');
  const dragState = useRef<{ pointerId: number; startX: number; startAngle: number } | null>(null);
  useConfiguratorWebMcp({ setProduct, setSize, setFinish, setOptions, setQuantity });

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
    setNotice('');
  };

  const reset = () => {
    setProduct(defaults.product);
    setSize(defaults.size);
    setFinish(defaults.finish);
    setOptions(defaults.options);
    setQuantity(defaults.quantity);
    setAngle(defaults.angle);
    setNotice('Configuration restored');
    resetDemoDeveloperState();
  };

  const startSceneDrag = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button, input, a')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = { pointerId: event.pointerId, startX: event.clientX, startAngle: angle };
  };

  const dragScene = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const nextAngle = drag.startAngle + (event.clientX - drag.startX) * 0.18;
    setAngle(Math.max(-36, Math.min(28, nextAngle)));
  };

  const endSceneDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (dragState.current?.pointerId === event.pointerId) dragState.current = null;
  };

  const sceneStyle = {
    '--finish': selectedFinish.swatch,
    '--scene-angle': angle + 'deg',
    '--desk-width': selectedSize.id === '120' ? '68%' : selectedSize.id === '180' ? '94%' : '82%',
    '--desk-depth': selectedProduct.depth + 'px',
  } as CSSProperties;

  return (
    <main className="forma-app">
      <header className="forma-header">
        <a className="forma-brand" href="/"><span>F</span><strong>FORMA</strong><small>WORKSHOP</small></a>
        <nav><a className="active" href="#configure">Configure</a><a href="#materials">Materials</a><a href="#specification">Specification</a></nav>
        <div className="forma-header-actions"><button type="button">Saved designs <span>2</span></button><div className="forma-avatar">MM</div></div>
      </header>

      <div className="forma-breadcrumb"><a href="/">PersonalWebMCP demos</a><span>/</span><strong>Workspace configurator</strong><button type="button" onClick={reset}>Reset design</button></div>

      <section className="forma-layout" id="configure">
        <div className="forma-stage" style={sceneStyle}>
          <div className="forma-stage-copy">
            <span>CONFIGURATION 04—26</span>
            <h1>{selectedProduct.name}</h1>
            <p>{selectedProduct.subtitle}. Designed around your room, tools and working rhythm.</p>
          </div>
          <div className="forma-view-controls">
            <label>Rotate view<input type="range" min="-36" max="28" value={angle} onChange={(event) => setAngle(Number(event.target.value))} /></label>
            <button type="button" onClick={() => setAngle(defaults.angle)}>Front</button>
          </div>

          <div
            className="forma-scene"
            aria-label={selectedSize.label + ' ' + selectedFinish.label + ' ' + selectedProduct.name + '. Drag to rotate.'}
            onPointerDown={startSceneDrag}
            onPointerMove={dragScene}
            onPointerUp={endSceneDrag}
            onPointerCancel={endSceneDrag}
          >
            <div className={'furniture-scene product-' + product}>
              <div className="furniture-model">
                <div className="furniture-top">
                  <i className="top-face" />
                  <i className="underside-face" />
                  <i className="front-face" />
                  <i className="back-face" />
                  <i className="side-face" />
                  <i className="other-side-face" />
                </div>

                {product === 'focus-desk' && <>
                  <div className="frame-leg focus-left"><i /><b /><em /></div>
                  <div className="frame-leg focus-right"><i /><b /><em /></div>
                  <div className="support-rail support-left" />
                  <div className="support-rail support-right" />
                  <div className="crossbar" />
                </>}

                {product === 'studio-table' && <>
                  <div className="trestle trestle-left"><i /><b /><em /></div>
                  <div className="trestle trestle-right"><i /><b /><em /></div>
                  <div className="studio-beam" />
                  <div className="studio-rail" />
                </>}

                {product === 'compact-console' && <>
                  <div className="console-cabinet"><i /><b /><em /></div>
                  <div className="console-panel-leg" />
                  <div className="console-cubby" />
                </>}

                {options.includes('monitor-shelf') && <div className="scene-monitor-shelf"><i /><b /></div>}
                {options.includes('drawer') && <div className="scene-drawer"><span /></div>}
                {options.includes('cable-tray') && <div className="scene-cable-tray" />}
              </div>
            </div>
            <div className="scene-shadow" />
            <div className="scene-prompt"><span>↔</span> Drag to rotate</div>
          </div>

          <div className="forma-dimensions"><span>{selectedSize.label} width</span><span>{selectedProduct.depth} cm depth</span><span>74 cm height</span></div>
        </div>

        <aside className="forma-panel">
          <div className="forma-panel-heading"><div><span>YOUR CONFIGURATION</span><strong>{currency.format(total)}</strong></div><small>Made to order · ships in 4–6 weeks</small></div>

          <section className="forma-control-section">
            <div className="forma-section-title"><span>01</span><strong>Choose a form</strong></div>
            <div className="forma-product-list">
              {configuratorProducts.map((item) => (
                <button className={product === item.id ? 'selected' : ''} type="button" onClick={() => { setProduct(item.id); setNotice(''); }} key={item.id}>
                  <span className={'mini-furniture mini-' + item.id}><i /><b /><em /></span>
                  <span><strong>{item.name}</strong><small>{item.subtitle}</small></span>
                  <b>{currency.format(item.basePrice)}</b>
                </button>
              ))}
            </div>
          </section>

          <section className="forma-control-section">
            <div className="forma-section-title"><span>02</span><strong>Set dimensions</strong></div>
            <div className="forma-size-list">
              {configuratorSizes.map((item) => <button className={size === item.id ? 'selected' : ''} type="button" onClick={() => setSize(item.id)} key={item.id}><strong>{item.label}</strong><small>{item.id === '120' ? 'Compact' : item.id === '180' ? 'Expansive' : 'Standard'}</small></button>)}
            </div>
          </section>

          <section className="forma-control-section" id="materials">
            <div className="forma-section-title"><span>03</span><strong>Select material</strong></div>
            <div className="forma-materials">
              {configuratorFinishes.map((item) => <button className={finish === item.id ? 'selected' : ''} type="button" onClick={() => setFinish(item.id)} key={item.id}><i style={{ background: item.swatch }} /><span><strong>{item.label}</strong><small>{item.price ? '+' + currency.format(item.price) : 'Included'}</small></span></button>)}
            </div>
          </section>

          <section className="forma-control-section">
            <div className="forma-section-title"><span>04</span><strong>Add functionality</strong></div>
            <div className="forma-addon-list">
              {configuratorOptions.map((item) => <label key={item.id}><input type="checkbox" checked={options.includes(item.id)} onChange={() => toggleOption(item.id)} /><span><strong>{item.label}</strong><small>+{currency.format(item.price)}</small></span></label>)}
            </div>
          </section>

          <div className="forma-purchase" id="specification">
            <label>Qty <input type="number" min="1" max="8" value={quantity} onChange={(event) => setQuantity(Math.max(1, Math.min(8, Number(event.target.value) || 1)))} /></label>
            <button type="button" onClick={() => setNotice('Design added to project board')}>Add to project · {currency.format(total)}</button>
          </div>
          {notice && <p className="forma-notice" role="status">{notice}</p>}
        </aside>
      </section>

      <div className="forma-inspector"><DemoDeveloperPanel /></div>
    </main>
  );
}
