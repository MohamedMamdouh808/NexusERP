import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input, Select, Textarea, Checkbox } from '../index';

describe('Form controls states (T039, FR-021, FR-050)', () => {
  describe('Input', () => {
    it('renders default state with associated label and no aria-invalid', () => {
      render(<Input id="test-input" label="Username" />);
      const input = screen.getByRole('textbox', { name: 'Username' });
      expect(input).toBeInTheDocument();
      expect(input).not.toHaveAttribute('aria-invalid');
    });

    it('renders focus-visible state', async () => {
      const user = userEvent.setup();
      render(<Input id="test-input" label="Username" />);
      const input = screen.getByRole('textbox', { name: 'Username' });
      await user.tab();
      expect(input).toHaveFocus();
    });

    it('renders filled state with current value', () => {
      render(<Input id="test-input" label="Username" defaultValue="johndoe" />);
      const input = screen.getByRole('textbox', { name: 'Username' });
      expect(input).toHaveValue('johndoe');
    });

    it('renders required state', () => {
      render(<Input id="test-input" label="Username" required />);
      const input = screen.getByRole('textbox', { name: /Username/ });
      expect(input).toBeRequired();
    });

    it('renders with help text programmatically associated via aria-describedby', () => {
      render(<Input id="test-input" label="Username" helpText="Enter your handle" />);
      const input = screen.getByRole('textbox', { name: 'Username' });
      expect(input).toHaveAccessibleDescription('Enter your handle');
    });

    it('renders invalid state with inline error and aria-invalid="true"', () => {
      render(<Input id="test-input" label="Username" error="Username already taken" />);
      const input = screen.getByRole('textbox', { name: 'Username' });
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveAccessibleDescription('Username already taken');
      expect(screen.getByText('Username already taken')).toBeInTheDocument();
    });

    it('renders disabled state', () => {
      render(<Input id="test-input" label="Username" disabled />);
      const input = screen.getByRole('textbox', { name: 'Username' });
      expect(input).toBeDisabled();
    });
  });

  describe('Select', () => {
    const options = [
      { value: 'apple', label: 'Apple' },
      { value: 'banana', label: 'Banana' },
    ];

    it('renders default state with placeholder option and label', () => {
      render(<Select id="test-select" label="Fruit" placeholder="Choose a fruit" options={options} />);
      const select = screen.getByRole('combobox', { name: 'Fruit' });
      expect(select).toBeInTheDocument();
      expect(screen.getByText('Choose a fruit')).toBeInTheDocument();
    });

    it('renders selected value state', () => {
      render(<Select id="test-select" label="Fruit" defaultValue="apple" options={options} />);
      const select = screen.getByRole('combobox', { name: 'Fruit' });
      expect(select).toHaveValue('apple');
    });

    it('renders required, with help text, invalid with inline error, and disabled states', () => {
      const { rerender } = render(
        <Select id="test-select" label="Fruit" required helpText="Select one" options={options} />,
      );
      const select = screen.getByRole('combobox', { name: /Fruit/ });
      expect(select).toBeRequired();
      expect(select).toHaveAccessibleDescription('Select one');

      rerender(
        <Select id="test-select" label="Fruit" error="Selection required" options={options} />,
      );
      expect(select).toHaveAttribute('aria-invalid', 'true');
      expect(select).toHaveAccessibleDescription('Selection required');

      rerender(<Select id="test-select" label="Fruit" disabled options={options} />);
      expect(select).toBeDisabled();
    });
  });

  describe('Textarea', () => {
    it('renders default, focus, filled, required, help text, invalid, and disabled states', async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        <Textarea id="test-desc" label="Description" helpText="Provide detail" required />,
      );
      const textarea = screen.getByRole('textbox', { name: /Description/ });
      expect(textarea).toBeRequired();
      expect(textarea).toHaveAccessibleDescription('Provide detail');

      await user.tab();
      expect(textarea).toHaveFocus();

      rerender(<Textarea id="test-desc" label="Description" defaultValue="Long note" />);
      expect(screen.getByRole('textbox', { name: 'Description' })).toHaveValue('Long note');

      rerender(<Textarea id="test-desc" label="Description" error="Too short" />);
      const invalidTextarea = screen.getByRole('textbox', { name: 'Description' });
      expect(invalidTextarea).toHaveAttribute('aria-invalid', 'true');
      expect(invalidTextarea).toHaveAccessibleDescription('Too short');

      rerender(<Textarea id="test-desc" label="Description" disabled />);
      expect(screen.getByRole('textbox', { name: 'Description' })).toBeDisabled();
    });
  });

  describe('Checkbox', () => {
    it('renders unchecked and checked states with role checkbox and aria-checked', () => {
      const { rerender } = render(<Checkbox id="agree" label="I agree" />);
      const checkbox = screen.getByRole('checkbox', { name: 'I agree' });
      expect(checkbox).not.toBeChecked();

      rerender(<Checkbox id="agree" label="I agree" checked onChange={() => {}} />);
      expect(checkbox).toBeChecked();
    });

    it('renders required, invalid, and disabled states', () => {
      const { rerender } = render(<Checkbox id="agree" label="I agree" required />);
      const checkbox = screen.getByRole('checkbox', { name: /I agree/ });
      expect(checkbox).toBeRequired();

      rerender(<Checkbox id="agree" label="I agree" error="Must agree" />);
      expect(checkbox).toHaveAttribute('aria-invalid', 'true');
      expect(checkbox).toHaveAccessibleDescription('Must agree');

      rerender(<Checkbox id="agree" label="I agree" disabled />);
      expect(checkbox).toBeDisabled();
    });
  });
});
