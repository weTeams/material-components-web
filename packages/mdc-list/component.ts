/**
 * @license
 * Copyright 2018 Google Inc.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

import {MDCComponent} from '@material/base/component';
import {SpecificEventListener} from '@material/base/types';
import {closest, matches} from '@material/dom/ponyfill';
import {MDCListAdapter} from './adapter';
import {cssClasses, evolutionAttribute, evolutionClassNameMap, numbers, strings} from './constants';
import {MDCListFoundation} from './foundation';
import {MDCListActionEventDetail, MDCListIndex} from './types';

export type MDCListFactory = (el: Element, foundation?: MDCListFoundation) =>
    MDCList;

export class MDCList extends MDCComponent<MDCListFoundation> {
  set vertical(value: boolean) {
    this.foundation.setVerticalOrientation(value);
  }

  get listElements(): Element[] {
    return Array.from(this.root.querySelectorAll(
        `.${this.classNameMap_[cssClasses.LIST_ITEM_CLASS]}`));
  }

  set wrapFocus(value: boolean) {
    this.foundation.setWrapFocus(value);
  }

  /**
   * @return Whether typeahead is currently matching a user-specified prefix.
   */
  get typeaheadInProgress(): boolean {
    return this.foundation.isTypeaheadInProgress();
  }

  /**
   * Sets whether typeahead functionality is enabled on the list.
   * @param hasTypeahead Whether typeahead is enabled.
   */
  set hasTypeahead(hasTypeahead: boolean) {
    this.foundation.setHasTypeahead(hasTypeahead);
  }

  set singleSelection(isSingleSelectionList: boolean) {
    this.foundation.setSingleSelection(isSingleSelectionList);
  }

  get selectedIndex(): MDCListIndex {
    return this.foundation.getSelectedIndex();
  }

  set selectedIndex(index: MDCListIndex) {
    this.foundation.setSelectedIndex(index);
  }

  static attachTo(root: Element) {
    return new MDCList(root);
  }

  // The follow are assigned in initialSyncWithDOM().
  private handleKeydown_!: SpecificEventListener<'keydown'>;
  private handleClick_!: SpecificEventListener<'click'>;
  private focusInEventListener_!: SpecificEventListener<'focus'>;
  private focusOutEventListener_!: SpecificEventListener<'focus'>;
  private classNameMap_!: {[className: string]: string};
  private isEvolutionEnabled_!: boolean;
  private isInteractive_!: boolean;

  initialSyncWithDOM() {
    this.isEvolutionEnabled_ =
        evolutionAttribute in (this.root as HTMLElement).dataset;
    this.classNameMap_ = this.isEvolutionEnabled_ ?
        evolutionClassNameMap :
        Object.fromEntries(Object.values(cssClasses).map((v) => [v, v]));
    this.handleClick_ = this.handleClickEvent_.bind(this);
    this.handleKeydown_ = this.handleKeydownEvent_.bind(this);
    this.focusInEventListener_ = this.handleFocusInEvent_.bind(this);
    this.focusOutEventListener_ = this.handleFocusOutEvent_.bind(this);
    this.listen('keydown', this.handleKeydown_);
    this.listen('click', this.handleClick_);
    this.listen('focusin', this.focusInEventListener_);
    this.listen('focusout', this.focusOutEventListener_);
    this.layout();
    this.initializeListType();
    this.ensureFocusable_();
  }

  destroy() {
    this.unlisten('keydown', this.handleKeydown_);
    this.unlisten('click', this.handleClick_);
    this.unlisten('focusin', this.focusInEventListener_);
    this.unlisten('focusout', this.focusOutEventListener_);
  }

  layout() {
    const direction = this.root.getAttribute(strings.ARIA_ORIENTATION);
    this.vertical = direction !== strings.ARIA_ORIENTATION_HORIZONTAL;

    const itemSelector =
        `.${this.classNameMap_[cssClasses.LIST_ITEM_CLASS]}:not([tabindex])`;
    const childSelector = `.${this.classNameMap_[cssClasses.LIST_ITEM_CLASS]} ${
        strings.FOCUSABLE_CHILD_ELEMENTS}`;

    // List items need to have at least tabindex=-1 to be focusable.
    for (const el of this.root.querySelectorAll(itemSelector)) {
      el.setAttribute('tabindex', '-1');
    }

    // Child button/a elements are not tabbable until the list item is focused.
    for (const el of this.root.querySelectorAll(childSelector)) {
      el.setAttribute('tabindex', '-1');
    }

    if (this.isEvolutionEnabled_) {
      this.foundation.setUseSelectedAttribute(true);
    }
    this.foundation.layout();
  }

  /**
   * Extracts the primary text from a list item.
   * @param item The list item element.
   * @return The primary text in the element.
   */
  getPrimaryText(item: Element): string {
    const primaryText = item.querySelector(
        `.${this.classNameMap_[cssClasses.LIST_ITEM_PRIMARY_TEXT_CLASS]}`);
    if (this.isEvolutionEnabled_ || primaryText) {
      return primaryText?.textContent ?? '';
    }

    const singleLineText = item.querySelector(
        `.${this.classNameMap_[cssClasses.LIST_ITEM_TEXT_CLASS]}`);
    return (singleLineText && singleLineText.textContent) || '';
  }

  /**
   * Initialize selectedIndex value based on pre-selected list items.
   */
  initializeListType() {
    this.isInteractive_ =
        matches(this.root, strings.ARIA_INTERACTIVE_ROLES_SELECTOR);

    if (this.isEvolutionEnabled_ && this.isInteractive_) {
      const selection = Array.from(
          this.root.querySelectorAll(strings.SELECTED_ITEM_SELECTOR),
          (listItem: Element) => this.listElements.indexOf(listItem));

      if (matches(this.root, strings.ARIA_MULTI_SELECTABLE_SELECTOR)) {
        this.selectedIndex = selection;
      } else if (selection.length > 0) {
        this.selectedIndex = selection[0];
      }
      return;
    }

    const checkboxListItems =
        this.root.querySelectorAll(strings.ARIA_ROLE_CHECKBOX_SELECTOR);
    const radioSelectedListItem =
        this.root.querySelector(strings.ARIA_CHECKED_RADIO_SELECTOR);

    if (checkboxListItems.length) {
      const preselectedItems =
          this.root.querySelectorAll(strings.ARIA_CHECKED_CHECKBOX_SELECTOR);
      this.selectedIndex = Array.from(
          preselectedItems,
          (listItem: Element) => this.listElements.indexOf(listItem));
    } else if (radioSelectedListItem) {
      this.selectedIndex = this.listElements.indexOf(radioSelectedListItem);
    }
  }

  /**
   * Updates the list item at itemIndex to the desired isEnabled state.
   * @param itemIndex Index of the list item
   * @param isEnabled Sets the list item to enabled or disabled.
   */
  setEnabled(itemIndex: number, isEnabled: boolean) {
    this.foundation.setEnabled(itemIndex, isEnabled);
  }

  /**
   * Given the next desired character from the user, adds it to the typeahead
   * buffer. Then, attempts to find the next option matching the buffer. Wraps
   * around if at the end of options.
   *
   * @param nextChar The next character to add to the prefix buffer.
   * @param startingIndex The index from which to start matching. Defaults to
   *     the currently focused index.
   * @return The index of the matched item.
   */
  typeaheadMatchItem(nextChar: string, startingIndex?: number): number {
    return this.foundation.typeaheadMatchItem(
        nextChar, startingIndex, /** skipFocus */ true);
  }

  getDefaultFoundation() {
    // DO NOT INLINE this variable. For backward compatibility, foundations take
    // a Partial<MDCFooAdapter>. To ensure we don't accidentally omit any
    // methods, we need a separate, strongly typed adapter variable.
    const adapter: MDCListAdapter = {
      addClassForElementIndex: (index, className) => {
        const element = this.listElements[index];
        if (element) {
          element.classList.add(this.classNameMap_[className]);
        }
      },
      focusItemAtIndex: (index) => {
        const element = this.listElements[index] as HTMLElement | undefined;
        if (element) {
          element.focus();
        }
      },
      getAttributeForElementIndex: (index, attr) =>
          this.listElements[index].getAttribute(attr),
      getFocusedElementIndex: () =>
          this.listElements.indexOf(document.activeElement!),
      getListItemCount: () => this.listElements.length,
      getPrimaryTextAtIndex: (index) =>
          this.getPrimaryText(this.listElements[index]),
      hasCheckboxAtIndex: (index) => {
        const listItem = this.listElements[index];
        return !!listItem.querySelector(strings.CHECKBOX_SELECTOR);
      },
      hasRadioAtIndex: (index) => {
        const listItem = this.listElements[index];
        return !!listItem.querySelector(strings.RADIO_SELECTOR);
      },
      isCheckboxCheckedAtIndex: (index) => {
        const listItem = this.listElements[index];
        const toggleEl =
            listItem.querySelector<HTMLInputElement>(strings.CHECKBOX_SELECTOR);
        return toggleEl!.checked;
      },
      isFocusInsideList: () => {
        return this.root !== document.activeElement &&
            this.root.contains(document.activeElement);
      },
      isRootFocused: () => document.activeElement === this.root,
      listItemAtIndexHasClass: (index, className) =>
          this.listElements[index].classList.contains(
              this.classNameMap_[className]),
      notifyAction: (index) => {
        this.emit<MDCListActionEventDetail>(
            strings.ACTION_EVENT, {index}, /** shouldBubble */ true);
      },
      removeClassForElementIndex: (index, className) => {
        const element = this.listElements[index];
        if (element) {
          element.classList.remove(this.classNameMap_[className]);
        }
      },
      setAttributeForElementIndex: (index, attr, value) => {
        const element = this.listElements[index];
        if (element) {
          element.setAttribute(attr, value);
        }
      },
      setCheckedCheckboxOrRadioAtIndex: (index, isChecked) => {
        const listItem = this.listElements[index];
        const toggleEl = listItem.querySelector<HTMLInputElement>(
            strings.CHECKBOX_RADIO_SELECTOR);
        toggleEl!.checked = isChecked;

        const event = document.createEvent('Event');
        event.initEvent('change', true, true);
        toggleEl!.dispatchEvent(event);
      },
      setTabIndexForListItemChildren: (listItemIndex, tabIndexValue) => {
        const element = this.listElements[listItemIndex];
        const selector = `.${this.classNameMap_[cssClasses.LIST_ITEM_CLASS]} ${
            strings.CHILD_ELEMENTS_TO_TOGGLE_TABINDEX}`;
        for (const el of element.querySelectorAll(selector)) {
          el.setAttribute('tabindex', tabIndexValue);
        }
      },
    };
    return new MDCListFoundation(adapter);
  }

  /**
   * Ensures that at least one item is focusable if the list is interactive and
   * doesn't specify a suitable tabindex.
   */
  private ensureFocusable_() {
    if (this.isEvolutionEnabled_ && this.isInteractive_) {
      if (!this.root.querySelector(`.${
              this.classNameMap_[cssClasses.LIST_ITEM_CLASS]}[tabindex="0"]`)) {
        const index = this.initialFocusIndex_();
        if (index !== -1) {
          (this.listElements[index] as HTMLElement).tabIndex = 0;
        }
      }
    }
  }

  private initialFocusIndex_(): number {
    if (this.selectedIndex instanceof Array && this.selectedIndex.length > 0) {
      return this.selectedIndex[0];
    }
    if (typeof this.selectedIndex === 'number' &&
        this.selectedIndex !== numbers.UNSET_INDEX) {
      return this.selectedIndex;
    }
    const el = this.root.querySelector(
        `.${this.classNameMap_[cssClasses.LIST_ITEM_CLASS]}:not(.${
            this.classNameMap_[cssClasses.LIST_ITEM_DISABLED_CLASS]})`);
    if (el === null) {
      return -1;
    }
    return this.getListItemIndex_(el);
  }

  /**
   * Used to figure out which list item this event is targetting. Or returns -1
   * if there is no list item
   */
  private getListItemIndex_(el: Element) {
    const nearestParent = closest(
        el,
        `.${this.classNameMap_[cssClasses.LIST_ITEM_CLASS]}, .${
            this.classNameMap_[cssClasses.ROOT]}`);

    // Get the index of the element if it is a list item.
    if (nearestParent &&
        matches(
            nearestParent,
            `.${this.classNameMap_[cssClasses.LIST_ITEM_CLASS]}`)) {
      return this.listElements.indexOf(nearestParent);
    }

    return -1;
  }

  /**
   * Used to figure out which element was clicked before sending the event to
   * the foundation.
   */
  private handleFocusInEvent_(evt: FocusEvent) {
    const index = this.getListItemIndex_(evt.target as Element);
    this.foundation.handleFocusIn(evt, index);
  }

  /**
   * Used to figure out which element was clicked before sending the event to
   * the foundation.
   */
  private handleFocusOutEvent_(evt: FocusEvent) {
    const index = this.getListItemIndex_(evt.target as Element);
    this.foundation.handleFocusOut(evt, index);
  }

  /**
   * Used to figure out which element was focused when keydown event occurred
   * before sending the event to the foundation.
   */
  private handleKeydownEvent_(evt: KeyboardEvent) {
    const index = this.getListItemIndex_(evt.target as Element);
    const target = evt.target as Element;
    this.foundation.handleKeydown(
        evt,
        target.classList.contains(
            this.classNameMap_[cssClasses.LIST_ITEM_CLASS]),
        index);
  }

  /**
   * Used to figure out which element was clicked before sending the event to
   * the foundation.
   */
  private handleClickEvent_(evt: MouseEvent) {
    const index = this.getListItemIndex_(evt.target as Element);
    const target = evt.target as Element;
    // Toggle the checkbox only if it's not the target of the event, or the
    // checkbox will have 2 change events.
    const toggleCheckbox = !matches(target, strings.CHECKBOX_RADIO_SELECTOR);
    this.foundation.handleClick(index, toggleCheckbox);
  }
}
