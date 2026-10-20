import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog } from '../dialog';
import { ConfirmDialog } from '../confirm-dialog';

describe('Dialog and ConfirmDialog states (T042, FR-027, FR-028, FR-050)', () => {
  describe('Dialog', () => {
    it('renders closed state with nothing in document', () => {
      render(
        <Dialog open={false} onClose={() => {}} title="Test Dialog">
          Body
        </Dialog>,
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders open state with aria-modal="true" and moves focus in', () => {
      render(
        <Dialog open={true} onClose={() => {}} title="Test Dialog">
          <p>Dialog Content</p>
          <button type="button">Inside Button</button>
        </Dialog>,
      );
      const dialog = screen.getByRole('dialog', { name: 'Test Dialog' });
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute('aria-modal', 'true');
    });

    it('closes on Escape and calls onClose', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(
        <Dialog open={true} onClose={onClose} title="Test Dialog">
          <button type="button">Action</button>
        </Dialog>,
      );
      await user.keyboard('{Escape}');
      expect(onClose).toHaveBeenCalled();
    });

    it('traps Tab focus and restores focus to the opener when closed', async () => {
      const user = userEvent.setup();
      function DialogHarness() {
        const [open, setOpen] = useState(false);
        return (
          <>
            <button type="button" onClick={() => setOpen(true)}>Open test dialog</button>
            <Dialog open={open} onClose={() => setOpen(false)} title="Focus test">
              <button type="button">First action</button>
              <button type="button">Last action</button>
            </Dialog>
          </>
        );
      }

      render(<DialogHarness />);
      const opener = screen.getByRole('button', { name: 'Open test dialog' });
      await user.click(opener);

      const closeButton = screen.getByRole('button', { name: 'Close dialog' });
      const lastAction = screen.getByRole('button', { name: 'Last action' });
      expect(closeButton).toHaveFocus();

      lastAction.focus();
      await user.tab();
      expect(closeButton).toHaveFocus();

      await user.keyboard('{Shift>}{Tab}{/Shift}');
      expect(lastAction).toHaveFocus();

      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(opener).toHaveFocus();
    });
  });

  describe('ConfirmDialog', () => {
    it('renders open-non-destructive state with alertdialog role and clear consequence', () => {
      render(
        <ConfirmDialog
          open={true}
          onClose={() => {}}
          onConfirm={() => {}}
          title="Archive Order"
          description="This will move the order to archives."
          actionLabel="Archive"
        />,
      );
      expect(screen.getByRole('alertdialog', { name: 'Archive Order' })).toBeInTheDocument();
      expect(screen.getByText('This will move the order to archives.')).toBeInTheDocument();
      const confirmBtn = screen.getByRole('button', { name: 'Archive' });
      expect(confirmBtn).not.toHaveClass('button--danger');
    });

    it('renders open-destructive state with visually distinct destructive button', () => {
      render(
        <ConfirmDialog
          open={true}
          destructive
          onClose={() => {}}
          onConfirm={() => {}}
          title="Delete Customer"
          description="This action cannot be undone."
          actionLabel="Delete"
        />,
      );
      const confirmBtn = screen.getByRole('button', { name: 'Delete' });
      expect(confirmBtn).toHaveClass('button--danger');
    });

    it('renders confirming state with busy button that cannot be double-activated', async () => {
      const onConfirm = vi.fn();
      render(
        <ConfirmDialog
          open={true}
          loading
          onClose={() => {}}
          onConfirm={onConfirm}
          title="Processing"
          description="Confirming operation..."
          actionLabel="Confirm"
        />,
      );
      const confirmBtn = screen.getByRole('button', { name: 'Confirm' });
      expect(confirmBtn).toBeDisabled();
      expect(confirmBtn).toHaveAttribute('aria-busy', 'true');

      await userEvent.click(confirmBtn);
      expect(onConfirm).not.toHaveBeenCalled();
    });
  });
});
